import colors from 'colors/safe'
import fs from 'fs'
import ini from 'ini'
import os from 'os'
import program from 'commander'
import puppeteer from 'puppeteer'
import readline from 'readline-sync'
import { STS } from 'aws-sdk'

const pjson = require('../package.json')

const CREDENTIALS_FILE = os.homedir() + '/.aws/credentials'

class AWSSamlLogin {

  public static parsePost(postData: string|undefined): any {
    if (!postData) { return {} }

    const args = postData.split('&')

    return args.reduce((acc, arg) => {
      const [key, val] = decodeURIComponent(arg).split('=')
      return Object.assign(acc, { [key]: val })
    }, {})
  }

  private loginUrl: string = ''
  private duration: number = 3600

  constructor(args: string[]) {
    program
      .version(pjson.version)
      .description(pjson.description)
      .option('-d, --duration <secs>', 'session duration in seconds', '3600')
      .arguments('<login_url>')
    program.parse(args)

    if (!program.args.length) {
      program.outputHelp()
      process.exit(0)
    }

    this.duration = parseInt(program.duration, 10)
    this.loginUrl = program.args[0]
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

        const decoded = Buffer
          .from(post.SAMLResponse, 'base64')
          .toString('ascii')

        const roles = decoded
          .match(/arn:aws:iam.+?(?=<)/g)!
          .map((r) => {
            const [ principal, role ] = r.split(',')
            return { principal, role }
          })

        console.log('\nAvailable roles:')
        roles.forEach((r, i) => console.log(`${colors.cyan(i.toString())}: ${r.role}`))
        console.log(' ')

        const selection = readline.question('Which role do you want to use? ')
        const selectedRole = roles[parseInt(selection, 10)]

        if (!selectedRole) {
          console.log('You did not select one of the available roles!')
          process.exit(1)
        }

        const sts = new STS()
        let resp: STS.Types.AssumeRoleWithSAMLResponse = {}
        try {
          resp = await sts.assumeRoleWithSAML({
            DurationSeconds: this.duration,
            PrincipalArn: selectedRole.principal,
            RoleArn: selectedRole.role,
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

        const profile = readline.question('\nProfile you would like to update (or create): ')
        credentials = Object.assign(credentials, { [profile]: {
          aws_access_key_id: resp.Credentials!.AccessKeyId,
          aws_secret_access_key: resp.Credentials!.SecretAccessKey,
          aws_session_token: resp.Credentials!.SessionToken,
        }})

        fs.writeFileSync(CREDENTIALS_FILE, ini.stringify(credentials))
        const expiration = new Date(resp.Credentials!.Expiration)
        console.log(`\nProfile '${colors.cyan(profile)}' updated with credentials`)
        console.log('Expires: ', colors.green(expiration.toString()))
        console.log('\nRemember to update your region information in "~/.aws/config"')
        console.log('see: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html')
      }

      req.continue()
    })

    try {
      await page.goto(this.loginUrl)
    } catch (err) {
      console.error(err.message)
      process.exit(1)
    }
  }
}

export default AWSSamlLogin
