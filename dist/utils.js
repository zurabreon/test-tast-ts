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
exports.getHuminizeTimeFromUnix = exports.getUniqNumbers = exports.getTodayDateTime = exports.getDateUnixValue = exports.getUnixBithdate = exports.makeField = exports.getAllPages = exports.getFieldValues = exports.getFieldValue = exports.getClearPhoneNumber = void 0;
const moment_1 = __importDefault(require("moment"));
const getTodayDateTime = () => (0, moment_1.default)().format("YYYY-MM-DD HH:MM:ss");
exports.getTodayDateTime = getTodayDateTime;
const getClearPhoneNumber = (tel) => {
    const clearNumber = !tel ? [] : tel.split("").filter(item => new RegExp(/\d/).test(item));
    if (!clearNumber.length) {
        return undefined;
    }
    return clearNumber.length > 10 ? clearNumber.join("").slice(1) : clearNumber.join("");
};
exports.getClearPhoneNumber = getClearPhoneNumber;
const getFieldValue = (customFields, fieldId) => {
    const field = customFields
        ? customFields.find((item) => String(item.field_id || item.id) === String(fieldId))
        : undefined;
    const value = field ? field.values[0].value : undefined;
    return value;
};
exports.getFieldValue = getFieldValue;
const getFieldValues = (customFields, fieldId) => {
    const field = customFields
        ? customFields.find((item) => String(item.field_id || item.id) === String(fieldId))
        : undefined;
    const values = field ? field.values : [];
    return values.map((item) => item.value);
};
exports.getFieldValues = getFieldValues;
const getAllPages = (request, page = 1, limit = 200) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log(`Downloading page ${page}`);
        let res = yield request({ page, limit });
        let retry = 3;
        console.log("Quantity of elements", res.length);
        if (!res.length) {
            for (let i = 0; i < retry; i++) {
                console.log("Array is empty, try to get page again");
                res = yield request({ page, limit });
                if (res.length === limit) {
                    break;
                }
            }
        }
        if (res.length === limit) {
            const next = yield getAllPages(request, page + 1, limit);
            return [...res, ...next];
        }
        return res;
    }
    catch (e) {
        console.log(e);
    }
});
exports.getAllPages = getAllPages;
const makeField = (field_id, value, enum_id) => {
    if (!value) {
        return undefined;
    }
    return {
        field_id,
        values: [
            {
                value,
                enum_id
            },
        ],
    };
};
exports.makeField = makeField;
const getHuminizeTimeFromUnix = (unixTimeStamp) => {
    // Принимаем в секундах, моменту нужны миллисекунды
    const time = unixTimeStamp * 1000;
    return (0, moment_1.default)(time).format("YYYY-MM-DD HH:mm:ss.SSS");
};
exports.getHuminizeTimeFromUnix = getHuminizeTimeFromUnix;
const getUnixBithdate = (date) => {
    const unix = (0, moment_1.default)(date, "DD.MM.YYYY").utcOffset(0).unix();
    return unix;
};
exports.getUnixBithdate = getUnixBithdate;
const getDateUnixValue = (date) => {
    return (0, moment_1.default)((0, moment_1.default)(date).utcOffset(3).format("DD.MM.YYYY HH:mm:ss"), "DD.MM.YYYY HH:mm:ss").unix();
};
exports.getDateUnixValue = getDateUnixValue;
const getUniqNumbers = (numbers) => {
    const numberCollection = new Set();
    numbers.forEach((number) => numberCollection.add(number));
    const uniqNumbers = Array.from(numberCollection).map(Number);
    return uniqNumbers;
};
exports.getUniqNumbers = getUniqNumbers;
