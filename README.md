## aws-saml-login
Utility to help with AWS credential management via SAML.  This uses puppeteer
and chromium to go to a user specified login url.  After following all redirects
and allowing the user to login, it will intercept the `SAMLResponse` and make a
call to Amazon STS to get temporary credentials.  These can then be used via the
[AWS profiles feature](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html).

NOTE: This has been tested with Microsoft Edge and works, any chromium based
browser is likely to work.

## Requirements
- NodeJS v18 or above

## Config Files
This utility will create/update two config files:
1. `~/.aws/credentials`
  The location of the AWS Profile credentials.  It will update specifically
  named profiles only.

1. `~/.config/aws-saml-login/config`
  The configuration for this utility.  It will save info for the `--refresh`
  option to streamline the login of commonly used profiles, as well as info on
  which browser you choose to use and the AWS Region.

## Install
```shell
$ npm install
$ npm pack
$ npm install -g <tgz file created from previous command>
```

## Usage
```shell

Usage: index [options] [login_url]

A simple cli utility to get temporary AWS credentials via a SAML endpoint

Options:
  -V, --version                 output the version number
  -b, --basic_auth              use basic auth from the cli to login, this will run the browser in
                                headless mode
  -d, --duration <secs>         session duration in seconds (default: "28800")
  -p, --profile <profile_name>  default profile to use
  -r, --refresh <profile_name>  attempts to refresh an existing profile using config options saved
                                in "~/.config/aws-saml-login/config".  Will create the entry if it
                                does not exist.

  -a, --role_arn <role_arn>     role ARN to login as
  -c, --chrome_path <path>      System path to chrome executable
  -n, --aws_region <region>     AWS Region
  -h, --help                    display help for command

```
