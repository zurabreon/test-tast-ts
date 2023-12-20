import express from "express";
import { Request , Response} from "express";
import  AmoCRM  from "./api/amo";
import { mainLogger } from "./logger"
import config from "./config";
import { getFieldValues } from "./utils";


const LIST_OF_SERVICES_ID = [486601, 486603, 486605, 486607, 486609]; // id полей услуг клиники
const TYPE_TASK_FOR_CHECK = 3186358; // id типа задачи "Проверить"
const MILISENCONDS_IN_PER_SECOND = 1000;
const UNIX_ONE_DAY = 86400;

const Entities = {
	Contacts: "contacts",
	Leads: "leads",
}


const app = express();
const api = new AmoCRM(config.SUB_DOMAIN, config.AUTH_CODE);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


api.getAccessToken();

app.get("/", async (req: Request, res: Response) => {
	res.send("123");
}); 

app.post("/hook", async (req: Request, res: Response) => {

	const contactsRequestBody = req.body.contacts;
	
	if (!contactsRequestBody) {
		res.status(400).send({message: "Bad request"});
		throw new Error('err');
	}

	const [{id:contactId}] = contactsRequestBody.update;
	
	const contact = await api.getContact(Number(contactId)); 

	const [ dealId ] = Object.keys(contactsRequestBody.update[0].linked_leads_id).map(Number); 

	if(!dealId) {
		mainLogger.debug("Contact isn't attatched to the deal");
		return;
	}

	const deal = await api.getDeal(dealId, [Entities.Contacts]);

	const isContactMain = deal._embedded.contacts.find((item :{id:number}) => item.id === Number(contactId)).is_main;

	if (!isContactMain) {
		mainLogger.debug("Contact isn't main");
		return;
	}

	const servicesBill = LIST_OF_SERVICES_ID.reduce((accum: number, elem: number) => accum + Number(getFieldValues(contact.custom_fields_values, elem)), 0);
		
	const updatedLeadsValues = {
		id: dealId,
		price: servicesBill,
	};
	
	await api.updateDeals(updatedLeadsValues);

	const completeTill = Math.floor(Date.now() / MILISENCONDS_IN_PER_SECOND) + UNIX_ONE_DAY;

	const tasks = (await api.getTasks())._embedded.tasks;

	const isTaskAlreadyCreated = tasks.find((item :{entity_id:number, is_completed: boolean}) => (item.entity_id === dealId && item.is_completed === false));

	if (!isTaskAlreadyCreated) {
		const addTaskField = {
			responsible_user_id: deal.created_by,
			task_type_id: TYPE_TASK_FOR_CHECK,
			text: "Проверить бюджет",
			complete_till: completeTill,
			entity_id: dealId,
			entity_type: Entities.Leads,
		}

		await api.createTasks(addTaskField);
	}
	else {
		mainLogger.debug("Task has already been created");
	}

	res.status(200).send({message: "ok"}); 

});

app.post("/hookTask", async (req, res) => {
	
	const tasksRequreBody = req.body.task;

	if(tasksRequreBody) {

		const [{element_id:elementId}] = tasksRequreBody.update;
		const [{responsible_user_id:responsibleUserId}] = tasksRequreBody.update;

		if(!responsibleUserId){
			return;
		}

		const createdNoteField = [{
			created_by: Number(responsibleUserId),
			entity_id: elementId,
			entity_type: Entities.Leads,
			note_type: "common",
			params: {
				text: "Бюджет проверен, ошибок нет"
			},
		}];

		await api.createNotes(createdNoteField);
	}
	else{
		mainLogger.debug("Task update error");
	}

	mainLogger.debug(tasksRequreBody);

	res.status(200).send({message: "ok"});
});



app.listen(config.PORT,()=>mainLogger.debug('Server started on ', config.PORT))