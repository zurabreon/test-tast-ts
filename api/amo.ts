import axios from "axios";
import config from "../config";
import querystring from "querystring";
import fs, { access } from "fs";
import axiosRetry from "axios-retry";
import Api from "./api";
import {
    getUserLogger
} from "../logger";
import log4js from "log4js";
import { Contact } from "../types/contacts/contact";
import { LeadData } from "../types/lead/lead";

axiosRetry(axios, { retries: 3, retryDelay: axiosRetry.exponentialDelay });

class AmoCRM extends Api {
    AMO_TOKEN_PATH: string;
    LIMIT: number;
    ROOT_PATH: string;
    ACCESS_TOKEN: string;
    REFRESH_TOKEN: string;
    SUB_DOMAIN: string;
    logger: log4js.Logger;
    CODE: string;

    constructor(subDomain: string, code: string) {
        super();
        this.SUB_DOMAIN = subDomain;
        this.AMO_TOKEN_PATH = `./authclients/${this.SUB_DOMAIN}_amo_token.json`;
        this.LIMIT = 200;
        this.ROOT_PATH = `https://${this.SUB_DOMAIN}.amocrm.ru`
        this.ACCESS_TOKEN = "";
        this.REFRESH_TOKEN = "";
        this.logger = getUserLogger(this.SUB_DOMAIN);
        this.CODE = code;
    }

    authChecker = <T extends any[], D>(request: (...args: T) => Promise<D>) => {
        return async (...args: T): Promise<D> => {
            if (!this.ACCESS_TOKEN) {
                return this.getAccessToken().then(() => this.authChecker(request)(...args));
            }
            return request(...args).catch((err: any) => {
                this.logger.error(err.response);
                this.logger.error(err);
                this.logger.error(err.response.data);
                const data = err.response.data;
                if ('validation-errors' in data) {
                    // data['validation-errors'].forEach(({ errors }) => logger.error(errors))
                    this.logger.error('args', JSON.stringify(args, null, 2))
                }
                if (data.status == 401 && data.title === "Unauthorized") {
                    this.logger.debug("Нужно обновить токен");
                    return this.refreshToken().then(() => this.authChecker(request)(...args));
                }
                throw err
            });
        };
    };

    async requestAccessToken() {
        return axios
            .post(`${this.ROOT_PATH}/oauth2/access_token`, {
                client_id: config.CLIENT_ID,
                client_secret: config.CLIENT_SECRET,
                grant_type: "authorization_code",
                code: this.CODE,
                redirect_uri: config.REDIRECT_URI,
            })
            .then((res) => {
                this.logger.debug("Свежий токен получен");
                return res.data;
            })
            .catch((err) => {
                this.logger.error(err.response.data);
                throw err;
            });
    };

    async getAccessToken() {
        if (this.ACCESS_TOKEN) {
            return Promise.resolve(this.ACCESS_TOKEN);
        }
        try {
            const content = fs.readFileSync(this.AMO_TOKEN_PATH).toString();
            const token = JSON.parse(content);
            this.ACCESS_TOKEN = token.access_token;
            this.REFRESH_TOKEN = token.refresh_token;
            return Promise.resolve(token);
        } catch (error) {
            this.logger.error(`Ошибка при чтении файла ${this.AMO_TOKEN_PATH}`, error);
            this.logger.debug("Попытка заново получить токен");
            const token = await this.requestAccessToken();
            fs.writeFileSync(this.AMO_TOKEN_PATH, JSON.stringify(token));
            this.ACCESS_TOKEN = token.access_token;
            this.REFRESH_TOKEN = token.refresh_token;
            return Promise.resolve(token);
        }
    };

    async refreshToken() {
        return axios
            .post(`${this.ROOT_PATH}/oauth2/refresh_token`, {
                client_id: config.CLIENT_ID,
                client_secret: config.CLIENT_SECRET,
                grant_type: "refresh_token",
                REFRESH_TOKEN: this.REFRESH_TOKEN,
                redirect_uri: config.REDIRECT_URI,
            })
            .then((res) => {
                this.logger.debug("Токен успешно обновлен");
                const token = res.data;
                fs.writeFileSync(this.AMO_TOKEN_PATH, JSON.stringify(token));
                this.ACCESS_TOKEN = token.access_token;
                this.REFRESH_TOKEN = token.refresh_token;
                return token;
            })
            .catch((err) => {
                this.logger.error("Не удалось обновить токен");
                this.logger.error(err.response.data);
            });
    };

    getAccountData = this.authChecker(() => {
        return axios.get<any>(`${this.ROOT_PATH}/api/v4/account`, {
            headers: {
                Authorization: `Bearer ${this.ACCESS_TOKEN}`,
            },
        }).then((res) => res.data)
    });
    
    //Получить сделку
    getDeal = this.authChecker((id, withParam = []): Promise<LeadData> => {
        return axios
            .get<LeadData>(
                `${this.ROOT_PATH}/api/v4/leads/${id}?${querystring.encode({
                    with: withParam.join(","),
                })}`,
                {
                    headers: {
                        Authorization: `Bearer ${this.ACCESS_TOKEN}`,
                    },
                }
            )
            .then((res) => res.data);
    });

    //Обновить сделку
    updateDeals = this.authChecker((data)=> {
        return axios.patch(`${this.ROOT_PATH}/api/v4/leads`, [].concat(data), {
            headers: {
                Authorization: `Bearer ${this.ACCESS_TOKEN}`,
            },
        });
    });

    // Получить контакт по id
    getContact = this.authChecker((id: number): Promise<Contact> => {
        return axios
            .get<Contact>(`${this.ROOT_PATH}/api/v4/contacts/${id}`, {
                headers: {
                    Authorization: `Bearer ${this.ACCESS_TOKEN}`,
                },
            })
            .then((res) => res.data);
    });

    // Получить компанию по id
    getCompany = this.authChecker((id) => {
        return axios
            .get(`${this.ROOT_PATH}/api/v4/companies/${id}`, {
                headers: {
                    Authorization: `Bearer ${this.ACCESS_TOKEN}`,
                },
            })
            .then((res) => res.data);
    });

    //Получить задачу по id сущности
    getTasks = this.authChecker(() => {
        return axios
            .get(`${this.ROOT_PATH}/api/v4/tasks`, {
                headers: {
                    Authorization: `Bearer ${this.ACCESS_TOKEN}`,
                },
            })
            .then((res) => res.data);
    });
    
    //Создать задачу
    createTasks = this.authChecker((data)  => {
		const tasksData = [].concat(data);
		return axios.post(`${this.ROOT_PATH}/api/v4/tasks`, tasksData, {
			headers: {
				Authorization: `Bearer ${this.ACCESS_TOKEN}`,
			},
		});
	});

    //Создать примечание
    createNotes = this.authChecker((data) => {
        const [notesData] = [].concat(data);
        return axios.post(`${this.ROOT_PATH}/api/v4/${notesData.entity_type}/${notesData.entity_id}/notes`, [notesData],{
			headers: {
				Authorization: `Bearer ${this.ACCESS_TOKEN}`,
			},
		}); 
    })
}

export default AmoCRM; 