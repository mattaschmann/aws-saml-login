#!/usr/bin/env node

import program from 'commander'
import fs from 'fs'
import ini from 'ini'
import os from 'os'
import puppeteer from 'puppeteer'
import readline from 'readline-sync'
import { STS } from 'aws-sdk'

const pjson = require('../package.json')

const CREDENTIALS_FILE = os.homedir() + '/.aws/credentials'

// @Matt TODO: current turn this into class, move into other file, minimize cli.ts file
function parsePost(postData: string|undefined): any {
  if (!postData) return {}

  const args = postData.split('&')

  return args.reduce((acc, arg) => {
    const [key, val] = decodeURIComponent(arg).split('=')
    return Object.assign(acc, { [key]: val })
  }, {})
}


(async () => {
  let loginUrl = ''
  program
    .version(pjson.version)
    .description(pjson.description)
    .arguments('<login_url>')
    .action((login_url) => loginUrl = login_url)
  program.parse(process.argv)

  if (!program.args.length) {
    program.outputHelp()
    process.exit(1)
  }

  const browser = await puppeteer.launch({
    headless: false,
  })

  const pages = await browser.pages()
  const page = pages[0]

  await page.setRequestInterception(true)
  page.on('request', async (req) => {

    const post = parsePost(req.postData())
    if (post.SAMLResponse) {
      await browser.close()

      const decoded = Buffer
        .from(post.SAMLResponse, 'base64')
        .toString('ascii')

      const roles = decoded
        .match(/arn:aws:iam.+?(?=<)/g)!
        .map(r => {
          const [ principal, role ] = r.split(',')
          return { principal, role }
        })

      console.log('\nAvailable roles:\n')
      roles.forEach((r, i) => console.log(`${i}: ${r.role}`))
      console.log(' ')

      const selection = readline.question('Which role do you want to use? ')
      const selectedRole = roles[parseInt(selection)]

      if (!selectedRole) {
        console.log("You did not select one of the available roles!")
        process.exit(1)
      }

      const sts = new STS()
      const resp = await sts.assumeRoleWithSAML({
        PrincipalArn: selectedRole.principal,
        RoleArn: selectedRole.role,
        SAMLAssertion: post.SAMLResponse,
      }).promise()

      if (!resp.Credentials) {
        console.log('Invalid response from AWS!')
        process.exit(1)
      }

      console.log(' ')
      console.log(resp)
      console.log(' ')

      // @Matt TODO: create if not found?
      let credentials = ini.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'))

      console.log('Here are your existing profiles:\n')
      for (const key in credentials) {
        console.log(key)
      }
      console.log(' ')

      const profile = readline.question('Profile you would like to update (or create): ')
      credentials = Object.assign(credentials, { [profile]: {
        aws_access_key_id: resp.Credentials!.AccessKeyId,
        aws_secret_access_key: resp.Credentials!.SecretAccessKey,
        aws_session_token: resp.Credentials!.SessionToken,
      }})

      fs.writeFileSync(CREDENTIALS_FILE, ini.stringify(credentials))
      console.log(`\nProfile '${profile}' updated with credentials\n`)
      console.log('Remember to update the region information for this profile in "~/.aws/config"')
      console.log('see: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html')
    }

    req.continue()
  })

  page.goto(loginUrl!)
})();
