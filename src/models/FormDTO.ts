import { AttachmentArrayDTO } from "./AttachmentArrayDTO";
import { CustomizationEventsArrayDTO } from "./CustomizationEventsArrayDTO";
import { FormGeneralInfoDto } from "./FormGeneralInfoDto";

export interface FormDTO {
    username: string;
    password: string;
    companyId: number;
    parentDocumentId?: number;
    documentId?: number;
    publisherId: string;
    documentDescription?: string;
    cardDescription?: string;
    datasetName: string;
    Attachments: AttachmentArrayDTO;
    customEvents: CustomizationEventsArrayDTO;
    persistenceType?: number;
    generalInfo?: FormGeneralInfoDto;
    descriptionField?: string;
}
