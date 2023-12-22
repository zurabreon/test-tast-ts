import express from "express";
import { Request , Response} from "express";
import  AmoCRM  from "./api/amo";
import { mainLogger } from "./logger"
import config from "./config";
import { getFieldValueOfString, getFieldValue, getFieldValues } from "./utils";
import { CreatedNote } from "./types/notes/note";
import { LeadData } from "./types/lead/lead";
import { Customfield } from "./types/customField/customField";


const TYPE_TASK_FOR_CHECK = 3186358; // id типа задачи "Проверить"
const MILISENCONDS_IN_PER_SECOND = 1000;
const UNIX_ONE_DAY = 86400;
const MUTLI_LIST_SERVICES_ID = 460147;

const Entities = {
	Contacts: 'contacts',
	Leads: 'leads',
} as const

const app = express();
const api = new AmoCRM(config.SUB_DOMAIN, config.AUTH_CODE);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


api.getAccessToken();

app.get("/", async (_req: Request, res: Response) => {
	res.send('123');
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

	const leadsRequestBody = req.body.leads;

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

	const chosenServices: string[] = deal.custom_fields_values ? getFieldValues(deal.custom_fields_values!, MUTLI_LIST_SERVICES_ID) : []; //Выбранные услуги в сделке
	
	
	const servicesBill = chosenServices.reduce(

		function (accum: number, item: string){

			if(contact.custom_fields_values) {
				const price = Number(getFieldValueOfString(contact.custom_fields_values, item))
				
				console.log(price);

				return price ? accum + price: accum;
			}
			return accum;
		},
		0
	);
	
	const updatedLeadsValues: LeadData = { 
		id: dealId,
		price: servicesBill,
	};
	 
	if(deal.price !== servicesBill) {
		await api.updateDeals([updatedLeadsValues]);
		
		const completeTill = Math.floor(Date.now() / MILISENCONDS_IN_PER_SECOND) + UNIX_ONE_DAY;
	
		const tasks = await api.getTasks();
	
		const isTaskAlreadyCreated = tasks.some((item) => (item.entity_id === dealId && item.is_completed === false)) ?? false;
		
		if (!isTaskAlreadyCreated) {
	 
			const addTaskField = {
				responsible_user_id: deal.created_by,
				task_type_id: TYPE_TASK_FOR_CHECK,
				text: 'Проверить бюджет',
				complete_till: completeTill,
				entity_id: dealId,
				entity_type: Entities.Leads,
			}
			
			await api.createTasks([addTaskField]);
		} 
		else { 
			mainLogger.debug("Task has already been created");
			return;
	}

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
			entity_type: Entities.Leads,
			note_type: 'common',
			params: {
				text: 'Бюджет проверен, ошибок нет'
			},
		};

		mainLogger.debug(createdNoteField);

		await api.createNotes(elementId, Entities.Leads, [createdNoteField]);
	}
	else{
		mainLogger.debug("Task update error");
	}

	res.status(200).send({message: "ok"});
});



app.listen(config.PORT,()=>mainLogger.debug('Server started on ', config.PORT))