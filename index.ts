import express from "express";
import { Request , Response} from "express";
import  AmoCRM  from "./api/amo";
import { mainLogger } from "./logger"
import config from "./config";
import { getFieldValue, getFieldValues } from "./utils";

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
	}		
	
	await api.updateDeals(updatedLeadsValues);
	 
	res.status(200).send({message: "ok"}); 

});



app.listen(config.PORT,()=>mainLogger.debug('Server started on ', config.PORT))