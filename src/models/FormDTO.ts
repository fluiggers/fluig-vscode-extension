import { AttachmentArrayDTO } from "./AttachmentArrayDTO";
import { CustomizationEventsArrayDTO } from "./CustomizationEventsArrayDTO";

export interface FormDTO {
    username: string;
    password: string;
    companyId: number;
    parentDocumentId: number;
    publisherId: string;
    documentDescription: string;
    cardDescription: string;
    datasetName: string;
    Attachments: AttachmentArrayDTO;
    customEvents: CustomizationEventsArrayDTO;
    persistenceType: number;
}
