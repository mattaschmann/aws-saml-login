import colors from 'colors/safe'
import fs from 'fs'
import ini from 'ini'
import os from 'os'
import program from 'commander'
import puppeteer from 'puppeteer'
import readline from 'readline-sync'
import {STS} from 'aws-sdk'

const pjson = require('../package.json')

const CREDENTIALS_FILE_PATH = os.homedir() + '/.aws'
const CREDENTIALS_FILE = CREDENTIALS_FILE_PATH + '/credentials'
const CONFIG_FILE_PATH = os.homedir() + '/.config/aws-saml-login'
const CONFIG_FILE = CONFIG_FILE_PATH + '/config'

class AWSSamlLogin {

  public static parsePost(postData: string | undefined): any {
    if (!postData) {return {}}

    const args = postData.split('&')

    return args.reduce((acc, arg) => {
      const [key, val] = decodeURIComponent(arg).split('=')
      return Object.assign(acc, {[key]: val})
    }, {})
  }

  private loginUrl: string
  private role: string = ''
  private principal: string = ''
  private duration: number = 3600
  private profile: string
  private refresh: string
  private config: any = {}
  private profileConfig: any = {}

  constructor(args: string[]) {
    program
      .version(pjson.version)
      .description(pjson.description)
      .option('-d, --duration <secs>', 'session duration in seconds', '3600')
      .option('-p, --profile <profile_name>', 'default profile to use')
      .option('-r, --refresh <profile_name>', `attempts to refresh an existing profile using config options saved
                              in "~/.config/aws-saml-login/config".  Will create the entry if it
                              does not exist.\n`)
      .arguments('<login_url>')
    program.parse(args)

    if (!program.args.length && !program.refresh) {
      program.outputHelp()
      process.exit(0)
    }

    this.duration = parseInt(program.duration, 10)
    this.profile = program.profile
    this.refresh = program.refresh
    this.loginUrl = program.args[0]

    if (this.refresh) {
      this.profile = this.refresh
      if (fs.existsSync(CONFIG_FILE)) {
        this.config = ini.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
        this.profileConfig = this.config[this.refresh]
        this.loginUrl = this.profileConfig.loginUrl
        this.role = this.profileConfig.role
        this.principal = this.profileConfig.principal
      }

      if (!this.loginUrl) {
        this.loginUrl = readline.question('\nLogin URL: ')
      }
    }
  }

  public async login() {

    const browser = await puppeteer.launch({
      headless: false,
    })

    const pages = await browser.pages()
    const page = pages[0]

    await page.setRequestInterception(true)
    page.on('request', async (req) => {

      const post = AWSSamlLogin.parsePost(req.postData())
      if (post.SAMLResponse) {
        await browser.close()

        if (!this.role || !this.principal) {

          const decoded = Buffer
            .from(post.SAMLResponse, 'base64')
            .toString('ascii')

          const roles = decoded
            .match(/arn:aws:iam.+?(?=<)/g)!
            .map((i) => {
              const [p, r] = i.split(',')
              return {principal: p, role: r}
            })

          console.log('\nAvailable roles:')
          roles.forEach((r, i) => console.log(`${colors.cyan(i.toString())}: ${r.role}`))
          console.log(' ')

          const selection = readline.question('Which role do you want to use? ')
          const {role, principal} = roles[parseInt(selection, 10)]
          this.role = role
          this.principal = principal

          if (!this.role || !this.principal) {
            console.log('You did not select one of the available roles!')
            process.exit(1)
          }
        }

        const sts = new STS()
        let resp: STS.Types.AssumeRoleWithSAMLResponse = {}
        try {
          resp = await sts.assumeRoleWithSAML({
            DurationSeconds: this.duration,
            PrincipalArn: this.principal,
            RoleArn: this.role,
            SAMLAssertion: post.SAMLResponse,
          }).promise()
        } catch (err) {
          console.log('\n' + colors.red(err.code))
          console.log(err.message)
          console.log('see: https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/STS.html#assumeRoleWithSAML-property')
          process.exit(1)
        }

        if (!resp.Credentials) {
          console.log('Invalid response from AWS!')
          process.exit(1)
        }

        console.log('\nAWS Response:')
        console.log(resp)
        console.log(' ')

        let credentials = {}
        if (fs.existsSync(CREDENTIALS_FILE)) {
          credentials = ini.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'))
        }

        if (!this.profile) {

          const profiles = []
          for (const key in credentials) {
            if (credentials.hasOwnProperty(key)) {
              profiles.push(key)
            }
          }

          if (profiles.length > 0) {
            console.log('Existing profiles:')
            profiles.forEach((p) => console.log(colors.cyan(p)))
          } else {
            console.log('No profiles found')
          }

          this.profile = readline.question('\nProfile you would like to update (or create): ')
        }

        credentials = Object.assign(credentials, {
          [this.profile]: {
            aws_access_key_id: resp.Credentials!.AccessKeyId,
            aws_secret_access_key: resp.Credentials!.SecretAccessKey,
            aws_session_token: resp.Credentials!.SessionToken,
          },
        })

        fs.mkdirSync(CREDENTIALS_FILE_PATH, {recursive: true})
        fs.writeFileSync(CREDENTIALS_FILE, ini.stringify(credentials))
        const expiration = new Date(resp.Credentials!.Expiration)
        console.log(`\nProfile '${colors.cyan(this.profile)}' updated with credentials`)
        console.log('Expires: ', colors.green(expiration.toString()))
        console.log('\nRemember to update your region information in "~/.aws/config"')
        console.log('see: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html')

        // Write to config if we are refreshing
        if (this.refresh) {
          this.config[this.refresh] = {
            loginUrl: this.loginUrl,
            principal: this.principal,
            role: this.role,
          }
          fs.mkdirSync(CONFIG_FILE_PATH, {recursive: true})
          fs.writeFileSync(CONFIG_FILE, ini.stringify(this.config))
        }
      }

      req.continue()
    })

    try {
      await page.goto(this.loginUrl, {timeout: 0})
    } catch (err) {
      console.error(err.message)
      process.exit(1)
    }
  }
}

export default AWSSamlLogin
