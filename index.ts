import express from "express";
import { Request , Response} from "express";
import  AmoCRM  from "./api/amo";
import { mainLogger } from "./logger"
import config from "./config";
import { getFieldValues, getTodayDateTime } from "./utils";
import { Customfield } from "./types/customField/customField";
import { CreatedTask, Task } from "./types/task/task";
import { CreatedNote } from "./types/notes/note";
import { LeadData } from "./types/lead/lead";


const LIST_OF_SERVICES_ID = [486601, 486603, 486605, 486607, 486609]; // id полей услуг клиники
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

type ContactWebHook = {
	contacts: {
		update:[ {
			id: string,
			linked_leads_id: number,
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

app.post("/hook", async (req: Request<unknown, unknown, ContactWebHook>, res: Response) => {

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

	const servicesBill = LIST_OF_SERVICES_ID.reduce((accum: number, elem: number) => accum + Number(getFieldValues(contact.custom_fields_values!, elem)), 0);
		
	const updatedLeadsValues: LeadData = {
		id: dealId,
		price: servicesBill,
	};
	
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
		
		await api.updateDeals([updatedLeadsValues]);
		await api.createTasks([addTaskField]);
	}
	else {
		mainLogger.debug("Task has already been created");
	}

	res.status(200).send({message: "ok"}); 

});

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