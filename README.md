## aws-saml-login
Utility to help with AWS credential management via SAML.  This uses puppeteer
and chromium to go to a user specified login url.  After following all redirects
and allowing the user to login, it will intercept the `SAMLResponse` and make a
call to Amazon STS to get temporary credentials.  These can then be used via the
[AWS profiles feature](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html).

## Install
```shell
$ npm install -g aws-saml-login
```

## Usage
```shell

Usage: aws-saml-login [options] <login_url>

A simple cli utility to get temporary AWS credentials via a SAML endpoint

Options:
  -V, --version          output the version number
  -d, --duration <secs>  session duration in seconds (default: "3600")
  -h, --help             output usage information

```
