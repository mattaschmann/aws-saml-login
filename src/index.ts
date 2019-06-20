#!/usr/bin/env node

import AWSSamlLogin from './aws-saml-login'

new AWSSamlLogin(process.argv).login()
