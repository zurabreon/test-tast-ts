"use strict";
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
const express_1 = __importDefault(require("express"));
const amo_1 = __importDefault(require("./api/amo"));
const logger_1 = require("./logger");
const config_1 = __importDefault(require("./config"));
const utils_1 = require("./utils");
const LIST_OF_SERVICES_ID = [486601, 486603, 486605, 486607, 486609]; // id полей услуг клиники
const TYPE_TASK_FOR_CHECK = 3186358; // id типа задачи "Проверить"
const MILISENCONDS_IN_PER_SECOND = 1000;
const UNIX_ONE_DAY = 86400;
const Entities = {
    Contacts: "contacts",
    Leads: "leads",
};
const app = (0, express_1.default)();
const api = new amo_1.default(config_1.default.SUB_DOMAIN, config_1.default.AUTH_CODE);
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
api.getAccessToken();
app.get("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.send("123");
}));
app.post("/hook", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const contactsRequestBody = req.body.contacts;
    if (!contactsRequestBody) {
        res.status(400).send({ message: "Bad request" });
        throw new Error('err');
    }
    const contactId = Number(contactsRequestBody.update[0].id);
    const contact = yield api.getContact(contactId);
    const [dealId] = Object.keys(contactsRequestBody.update[0].linked_leads_id).map(Number);
    if (!dealId) {
        logger_1.mainLogger.debug("Contact isn't attatched to the deal");
        return;
    }
    const deal = yield api.getDeal(dealId, [Entities.Contacts]);
    const isContactMain = ((_c = (_b = (_a = deal._embedded) === null || _a === void 0 ? void 0 : _a.contacts) === null || _b === void 0 ? void 0 : _b.find(item => item.id === contactId)) === null || _c === void 0 ? void 0 : _c.is_main) || false;
    if (!isContactMain) {
        logger_1.mainLogger.debug("Contact isn't main");
        return;
    }
    const servicesBill = LIST_OF_SERVICES_ID.reduce((accum, elem) => accum + Number((0, utils_1.getFieldValues)(contact.custom_fields_values, elem)), 0);
    const updatedLeadsValues = {
        id: dealId,
        price: servicesBill,
    };
    const completeTill = Math.floor(Date.now() / MILISENCONDS_IN_PER_SECOND) + UNIX_ONE_DAY;
    const tasks = yield api.getTasks();
    const isTaskAlreadyCreated = (_d = tasks.some((item) => (item.entity_id === dealId && item.is_completed === false))) !== null && _d !== void 0 ? _d : false;
    if (!isTaskAlreadyCreated) {
        const addTaskField = {
            responsible_user_id: deal.created_by,
            task_type_id: TYPE_TASK_FOR_CHECK,
            text: "Проверить бюджет",
            complete_till: completeTill,
            entity_id: dealId,
            entity_type: Entities.Leads,
        };
        yield api.updateDeals([updatedLeadsValues]);
        yield api.createTasks([addTaskField]);
    }
    else {
        logger_1.mainLogger.debug("Task has already been created");
    }
    res.status(200).send({ message: "ok" });
}));
app.post("/hookTask", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tasksRequestBody = req.body.task;
    if (tasksRequestBody) {
        const [{ element_id: elementId }] = tasksRequestBody.update;
        const [{ responsible_user_id: responsibleUserId }] = tasksRequestBody.update;
        if (!responsibleUserId) {
            return;
        }
        const createdNoteField = {
            created_by: Number(responsibleUserId),
            entity_id: elementId,
            note_type: "common",
            params: {
                text: "Бюджет проверен, ошибок нет"
            },
        };
        yield api.createNotes(Entities.Leads, [createdNoteField]);
    }
    else {
        logger_1.mainLogger.debug("Task update error");
    }
    res.status(200).send({ message: "ok" });
}));
app.listen(config_1.default.PORT, () => logger_1.mainLogger.debug('Server started on ', config_1.default.PORT));
