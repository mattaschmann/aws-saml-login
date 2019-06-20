#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const aws_saml_login_1 = __importDefault(require("./aws-saml-login"));
new aws_saml_login_1.default(process.argv).login();
//# sourceMappingURL=index.js.map