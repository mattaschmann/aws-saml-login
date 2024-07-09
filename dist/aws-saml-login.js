"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sts = __importStar(require("@aws-sdk/client-sts"));
const safe_1 = __importDefault(require("colors/safe"));
const commander_1 = require("commander");
const fs_1 = __importDefault(require("fs"));
const ini_1 = __importDefault(require("ini"));
const os_1 = __importDefault(require("os"));
const puppeteer_core_1 = __importDefault(require("puppeteer-core"));
const readline_sync_1 = __importDefault(require("readline-sync"));
const pjson = require('../package.json');
const CREDENTIALS_FILE_PATH = os_1.default.homedir() + '/.aws';
const CREDENTIALS_FILE = CREDENTIALS_FILE_PATH + '/credentials';
const CONFIG_FILE_PATH = os_1.default.homedir() + '/.config/aws-saml-login';
const CONFIG_FILE = CONFIG_FILE_PATH + '/config';
const program = new commander_1.Command();
class AWSSamlLogin {
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
    constructor(args) {
        this.basicAuth = false;
        this.config = {};
        this.duration = 28800;
        this.principal = '';
        this.profileConfig = {};
        this.role = '';
        this.roleArn = '';
        this.chromePath = '';
        this.awsRegion = '';
        program.exitOverride((err) => {
            if (err.code === 'commander.missingArgument' && !program.opts().refresh) {
                program.outputHelp();
            }
            if (!program.opts().refresh) {
                process.exit(err.exitCode);
            }
        });
        program
            .version(pjson.version)
            .description(pjson.description)
            .option('-b, --basic_auth', `use basic auth from the cli to login, this will run the browser in
                              headless mode`)
            .option('-d, --duration <secs>', 'session duration in seconds', '28800')
            .option('-p, --profile <profile_name>', 'default profile to use')
            .option('-r, --refresh <profile_name>', `attempts to refresh an existing profile using config options saved
                              in "~/.config/aws-saml-login/config".  Will create the entry if it
                              does not exist.\n`)
            .option('-a, --role_arn <role_arn>', `role ARN to login as`)
            .option('-c, --chrome_path <path>', `System path to chrome executable`)
            .option('-n, --aws_region <region>', `AWS Region`)
            .arguments('[login_url]');
        program.parse(args);
        if (!program.args.length && !program.opts().refresh) {
            program.outputHelp();
            process.exit(0);
        }
        this.basicAuth = program.opts().basic_auth;
        this.duration = parseInt(program.opts().duration, 10);
        this.loginUrl = program.args[0];
        this.profile = program.opts().profile;
        this.refresh = program.opts().refresh;
        this.roleArn = program.opts().role_arn;
        this.chromePath = program.opts().chrome_path;
        this.awsRegion = program.opts().aws_region;
        if (fs_1.default.existsSync(CONFIG_FILE)) {
            this.config = ini_1.default.parse(fs_1.default.readFileSync(CONFIG_FILE, 'utf-8'));
            if (!this.chromePath) {
                this.chromePath = this.config.chromePath || readline_sync_1.default.question('\nPath to chrome executable: ');
            }
            if (this.config.chromePath !== this.chromePath) {
                this.config.chromePath = this.chromePath;
                saveConfig(this.config);
                console.log(`\nChrome path "${safe_1.default.green(this.chromePath)}" stored in "${safe_1.default.yellow(CONFIG_FILE)}" for future reference`);
            }
            if (this.refresh) {
                this.profile = this.refresh;
                this.profileConfig = this.config[this.refresh] || {};
                this.loginUrl = this.profileConfig.loginUrl;
                this.role = this.profileConfig.role;
                this.principal = this.profileConfig.principal;
                this.awsRegion = this.profileConfig.awsRegion || this.awsRegion || readline_sync_1.default.question('\nAWS Region: ');
                if (!this.loginUrl) {
                    this.loginUrl = readline_sync_1.default.question('\nLogin URL: ');
                }
            }
            if (!this.awsRegion) {
                this.awsRegion = this.config.awsRegion || readline_sync_1.default.question('\nAWS Region: ');
            }
            if (this.config.awsRegion !== this.awsRegion) {
                this.config.awsRegion = this.awsRegion;
                saveConfig(this.config);
                console.log(`\nAWS Region "${safe_1.default.green(this.awsRegion)}" stored in "${safe_1.default.yellow(CONFIG_FILE)}" for future reference`);
            }
        }
        else {
            console.log("Couldn't load the config file");
            process.exit(1);
        }
    }
    login() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.basicAuth) {
                const username = readline_sync_1.default.question('username: ');
                console.log('NOTE: backspace is disabled!');
                const password = readline_sync_1.default.question('password: ', { hideEchoBack: true });
                this.basicCreds = { username, password };
            }
            const browser = yield puppeteer_core_1.default.launch({
                product: "chrome",
                headless: (this.basicAuth ? true : false),
                executablePath: this.chromePath
            });
            const pages = yield browser.pages();
            const page = pages[0];
            yield page.setRequestInterception(true);
            page.on('request', (req) => __awaiter(this, void 0, void 0, function* () {
                const post = AWSSamlLogin.parsePost(req.postData());
                if (post.SAMLResponse) {
                    yield browser.close();
                    if (!this.role || !this.principal) {
                        const decoded = Buffer
                            .from(post.SAMLResponse, 'base64')
                            .toString('ascii');
                        const roles = decoded
                            .match(/arn:aws:iam.+?(?=<)/g)
                            .map((i) => {
                            const [p, r] = i.split(',');
                            return { principal: p, role: r };
                        });
                        let roleMatch;
                        if (this.roleArn && this.roleArn.length) {
                            roleMatch = roles.find((r) => r.role === this.roleArn);
                            if (!roleMatch) {
                                console.log(`"${this.roleArn}" not an available role.`);
                            }
                        }
                        if (roleMatch) {
                            this.role = roleMatch.role;
                            this.principal = roleMatch.principal;
                        }
                        else {
                            console.log('\nAvailable roles:');
                            roles.forEach((r, i) => console.log(`${safe_1.default.cyan(i.toString())}: ${r.role}`));
                            console.log(' ');
                            const selection = readline_sync_1.default.question('Which role do you want to use? ');
                            const { role, principal } = roles[parseInt(selection, 10)];
                            this.role = role;
                            this.principal = principal;
                        }
                        if (!this.role || !this.principal) {
                            console.log('You did not select one of the available roles!');
                            process.exit(1);
                        }
                    }
                    const client = new sts.STSClient({
                        region: this.awsRegion
                    });
                    const command = new sts.AssumeRoleWithSAMLCommand({
                        DurationSeconds: this.duration,
                        PrincipalArn: this.principal,
                        RoleArn: this.role,
                        SAMLAssertion: post.SAMLResponse,
                    });
                    let resp = {};
                    try {
                        resp = yield client.send(command);
                    }
                    catch (err) {
                        console.log('\n' + safe_1.default.red(err.code));
                        console.log(err.message);
                        console.log('see: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/sts/command/AssumeRoleWithSAMLCommand/');
                        process.exit(1);
                    }
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
                    if (!this.profile) {
                        const profiles = Object.keys(credentials);
                        if (profiles.length > 0) {
                            console.log('Existing profiles:');
                            profiles.forEach((p) => console.log(safe_1.default.cyan(p)));
                        }
                        else {
                            console.log('No profiles found');
                        }
                        this.profile = readline_sync_1.default.question('\nProfile you would like to update (or create): ');
                    }
                    credentials = Object.assign(credentials, {
                        [this.profile]: {
                            aws_access_key_id: resp.Credentials.AccessKeyId,
                            aws_secret_access_key: resp.Credentials.SecretAccessKey,
                            aws_session_token: resp.Credentials.SessionToken,
                        },
                    });
                    if (!fs_1.default.existsSync(CREDENTIALS_FILE_PATH)) {
                        fs_1.default.mkdirSync(CREDENTIALS_FILE_PATH, { recursive: true });
                    }
                    fs_1.default.writeFileSync(CREDENTIALS_FILE, ini_1.default.stringify(credentials));
                    const expiration = new Date(resp.Credentials.Expiration);
                    console.log(`\nProfile '${safe_1.default.cyan(this.profile)}' updated with credentials`);
                    console.log('Expires: ', safe_1.default.green(expiration.toString()));
                    console.log('\nRemember to update your region information in "~/.aws/config"');
                    console.log('see: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-profiles.html');
                    // Write profile to config
                    if (this.refresh) {
                        this.config[this.refresh] = {
                            loginUrl: this.loginUrl,
                            principal: this.principal,
                            role: this.role,
                            awsRegion: this.awsRegion
                        };
                        saveConfig(this.config);
                        console.log(`\nProfile information stored in "${safe_1.default.yellow(CONFIG_FILE)}" for future reference`);
                    }
                }
                req.continue();
            }));
            try {
                if (this.basicAuth) {
                    page.authenticate(this.basicCreds);
                }
                yield page.goto(this.loginUrl, { timeout: 0 });
            }
            catch (err) {
                if (
                // Always happens if basic auth is not set
                err.message.startsWith('net::ERR_INVALID_AUTH_CREDENTIALS') ||
                    // Will happen with successful basic authentication
                    err.message.startsWith('Navigation failed because browser has disconnected!')) {
                    return;
                }
                console.error(err.message);
                console.error(err);
                process.exit(1);
            }
        });
    }
}
function saveConfig(config) {
    if (!fs_1.default.existsSync(CONFIG_FILE_PATH)) {
        fs_1.default.mkdirSync(CONFIG_FILE_PATH, { recursive: true });
    }
    fs_1.default.writeFileSync(CONFIG_FILE, ini_1.default.stringify(config));
}
exports.default = AWSSamlLogin;
//# sourceMappingURL=aws-saml-login.js.map