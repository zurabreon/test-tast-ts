import express from "express";
import { Request , Response} from "express";
import  AmoCRM  from "./api/amo";
import { mainLogger } from "./logger"
import config from "./config";
import { getFieldValues, getFieldValue } from "./utils";
import { CreatedNote } from "./types/notes/note";
import { LeadData } from "./types/lead/lead";
import { Customfield } from "./types/customField/customField";

const SERVICES_FIELD_ID = 460147;
const LIST_OF_SERVICES_NAME = [ // имена полей услуг клиники
	'Лазерная эпиляция',
	'Ультразвуковой лифтинг',
	'Лазерное удаление сосудов',
	'Лазерное омоложение лица',
	'Коррекция мимических морщин',
]; 
const TYPE_TASK_FOR_CHECK = 3186358; // id типа задачи "Проверить"
const MILISENCONDS_IN_PER_SECOND = 1000;
const UNIX_ONE_DAY = 86400;

const Entities = {
	Contacts: "contacts",
	Leads: "leads",
} as const

const app = express();
const api = new AmoCRM(config.SUB_DOMAIN, config.AUTH_CODE);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


api.getAccessToken();

app.get("/", async (req: Request, res: Response) => {
	res.send("123");
}); 

type WebHook = {
	contacts: {
		update:[ {
			id: string,
			linked_leads_id: number,
			custom_fields_values: Customfield,
		}]
	}
	leads: {
		update:[ {
			id: string,
		}]
	}
	
}

type TaskWebHook = {
	task: {
		update: [{
			id: string,
			element_id: number,
			element_type: string,
			responsible_user_id: number,
		}]
	}
}

app.post("/hook", async (req: Request<unknown, unknown, WebHook>, res:Response) => {

	const leadsRequestBody = req.body.leads

	if (!leadsRequestBody) {
		res.status(400).send({message: "Bad request"});
		throw new Error('err');
	}

	const dealId = Number(leadsRequestBody.update[0].id);

	const deal = await api.getDeal(dealId, [Entities.Contacts]);

	const mainContactId = deal._embedded?.contacts?.find(item => item.is_main === true)?.id || undefined;

	if(!mainContactId){
		mainLogger.debug("No contacts in lead");
		return;
	}

	const contact = await api.getContact(mainContactId);


	//Получаю названия объектов в мультисписка в сделке

	//Каким-то образом запушить надо в массив все эти элементы

	const qwerty = deal.custom_fields_values?.map(field => {
		field.values.map(item => {
			if(item.value) {
				if(LIST_OF_SERVICES_NAME.includes(String(item.value))) {
					
				}
			}
		});
	});

	const names = () => {
		if(deal.custom_fields_values){
			deal.custom_fields_values[0].values.map(item => {
				if (item.value) {
					if (LIST_OF_SERVICES_NAME.includes(String(item.value))) {
						return item.value;
					}
				}
			});
		}
	}

	console.log(qwerty);

	//Получаю названия объектов в мультисписка в контакте

	/*if(contact.custom_fields_values){
		contact.custom_fields_values.map(item => {
			if (item.field_name) {
				if (LIST_OF_SERVICES_NAME.includes(item.field_name)) {
					console.log(item.field_name);
				}
			}
		});
	}*/

	res.status(200).send({message: "ok"});
});


/*app.post("/hookContact", async (req: Request<unknown, unknown, WebHook>, res: Response) => {

	const contactsRequestBody = req.body.contacts;

	
	if (!contactsRequestBody) {
		res.status(400).send({message: "Bad request"});
		throw new Error('err');
	}
	const contactId = Number(contactsRequestBody.update[0].id);

	const contact = await api.getContact(contactId); 
	
	const [ dealId ] = Object.keys(contactsRequestBody.update[0].linked_leads_id).map(Number); 

	if(!dealId) {
		mainLogger.debug("Contact isn't attatched to the deal");
		return;
	}	

	const deal = await api.getDeal(dealId, [Entities.Contacts]);

	const isContactMain = deal._embedded?.contacts?.find(item => item.id === contactId)?.is_main || false;

	if (!isContactMain) {
		mainLogger.debug("Contact isn't main");
		return;
	}

	const servicesBill = LIST_OF_SERVICES_ID.reduce((accum: number, fieldId: number) => {

		if (contact.custom_fields_values) {

			return accum + Number(getFieldValue(contact.custom_fields_values, fieldId))
		}
		return accum;
	}, 0);
	
	const updatedLeadsValues: LeadData = {
		id: dealId,
		price: servicesBill,
	};
	
	await api.updateDeals([updatedLeadsValues]);
	
	const completeTill = Math.floor(Date.now() / MILISENCONDS_IN_PER_SECOND) + UNIX_ONE_DAY;

	const tasks = await api.getTasks();

	const isTaskAlreadyCreated = tasks.some((item) => (item.entity_id === dealId && item.is_completed === false)) ?? false;
	
	if (!isTaskAlreadyCreated) {

		const addTaskField = {
			responsible_user_id: deal.created_by,
			task_type_id: TYPE_TASK_FOR_CHECK,
			text: "Проверить бюджет",
			complete_till: completeTill,
			entity_id: dealId,
			entity_type: Entities.Leads,
		}
		
		await api.createTasks([addTaskField]);
	}
	else {
		mainLogger.debug("Task has already been created");
	}

	res.status(200).send({message: "ok"}); 

});*/

app.post("/hookTask", async (req: Request<unknown, unknown, TaskWebHook>, res: Response) => {
	
	const tasksRequestBody = req.body.task;
	
	if(tasksRequestBody) {

		const [{element_id:elementId}] = tasksRequestBody.update;
		const [{responsible_user_id:responsibleUserId}] = tasksRequestBody.update;

		if(!responsibleUserId){
			return;
		}

		const createdNoteField: CreatedNote = {
			created_by: Number(responsibleUserId),
			entity_id: elementId,
			note_type: "common",
			params: {
				text: "Бюджет проверен, ошибок нет"
			},
		};

		await api.createNotes(Entities.Leads, [createdNoteField]);
	}
	else{
		mainLogger.debug("Task update error");
	}

	res.status(200).send({message: "ok"});
});



app.listen(config.PORT,()=>mainLogger.debug('Server started on ', config.PORT))