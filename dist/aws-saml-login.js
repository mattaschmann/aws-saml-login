"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const safe_1 = __importDefault(require("colors/safe"));
const fs_1 = __importDefault(require("fs"));
const ini_1 = __importDefault(require("ini"));
const os_1 = __importDefault(require("os"));
const commander_1 = __importDefault(require("commander"));
const puppeteer_1 = __importDefault(require("puppeteer"));
const readline_sync_1 = __importDefault(require("readline-sync"));
const aws_sdk_1 = require("aws-sdk");
const pjson = require('../package.json');
const CREDENTIALS_FILE = os_1.default.homedir() + '/.aws/credentials';
class AWSSamlLogin {
    constructor(args) {
        this.loginUrl = '';
        // @Matt TODO: add an ttl argument?
        commander_1.default
            .version(pjson.version)
            .description(pjson.description)
            .arguments('<login_url>')
            .action((url) => this.loginUrl = url);
        commander_1.default.parse(args);
        if (!commander_1.default.args.length) {
            commander_1.default.outputHelp();
            process.exit(1);
        }
    }
    static parsePost(postData) {
        if (!postData) {
            return {};
        }
        const args = postData.split('&');
        return args.reduce((acc, arg) => {
            const [key, val] = decodeURIComponent(arg).split('=');
            return Object.assign(acc, { [key]: val });
        }, {});
    }
    login() {
        return __awaiter(this, void 0, void 0, function* () {
            const browser = yield puppeteer_1.default.launch({
                headless: false,
            });
            const pages = yield browser.pages();
            const page = pages[0];
            yield page.setRequestInterception(true);
            page.on('request', (req) => __awaiter(this, void 0, void 0, function* () {
                const post = AWSSamlLogin.parsePost(req.postData());
                if (post.SAMLResponse) {
                    yield browser.close();
                    const decoded = Buffer
                        .from(post.SAMLResponse, 'base64')
                        .toString('ascii');
                    const roles = decoded
                        .match(/arn:aws:iam.+?(?=<)/g)
                        .map((r) => {
                        const [principal, role] = r.split(',');
                        return { principal, role };
                    });
                    console.log('\nAvailable roles:\n');
                    roles.forEach((r, i) => console.log(`${safe_1.default.cyan(i.toString())}: ${r.role}`));
                    console.log(' ');
                    const selection = readline_sync_1.default.question('Which role do you want to use? ');
                    const selectedRole = roles[parseInt(selection, 10)];
                    if (!selectedRole) {
                        console.log('You did not select one of the available roles!');
                        process.exit(1);
                    }
                    const sts = new aws_sdk_1.STS();
                    const resp = yield sts.assumeRoleWithSAML({
                        PrincipalArn: selectedRole.principal,
                        RoleArn: selectedRole.role,
                        SAMLAssertion: post.SAMLResponse,
                    }).promise();
                    if (!resp.Credentials) {
                        console.log('Invalid response from AWS!');
                        process.exit(1);
                    }
                    console.log('\nAWS Response:');
                    console.log(resp);
                    console.log(' ');
                    let credentials = {};
                    if (fs_1.default.existsSync(CREDENTIALS_FILE)) {
                        credentials = ini_1.default.parse(fs_1.default.readFileSync(CREDENTIALS_FILE, 'utf-8'));
                    }
                    const profiles = [];
                    for (const key in credentials) {
                        if (credentials.hasOwnProperty(key)) {
                            profiles.push(key);
                        }
                    }
                    if (profiles.length > 0) {
                        console.log('Here are your existing profiles:\n');
                        profiles.forEach((p) => console.log(safe_1.default.cyan(p)));
                    }
                    else {
                        console.log('No profiles found');
                    }
                    const profile = readline_sync_1.default.question('\nProfile you would like to update (or create): ');
                    credentials = Object.assign(credentials, { [profile]: {
                            aws_access_key_id: resp.Credentials.AccessKeyId,
                            aws_secret_access_key: resp.Credentials.SecretAccessKey,
                            aws_session_token: resp.Credentials.SessionToken,
                        } });
                    fs_1.default.writeFileSync(CREDENTIALS_FILE, ini_1.default.stringify(credentials));
                    // @Matt TODO: output ttl when we have it, in human form?
                    console.log(`\nProfile '${safe_1.default.cyan(profile)}' updated with credentials\n`);
                    console.log('Remember to update your region information in "~/.aws/config"');
                    console.log('see: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html');
                }
                req.continue();
            }));
            // @Matt TODO: figure out error handle
            page.goto(this.loginUrl);
        });
    }
}
exports.default = AWSSamlLogin;
//# sourceMappingURL=aws-saml-login.js.map