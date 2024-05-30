export interface AttributionMechanismDTO {
    attributionMecanismPK: {
      companyId: number;
      attributionMecanismId: string;
    },
    assignmentType: number; // 1
    controlClass: string; // "com.datasul.technology.webdesk.workflow.assignment.customization.CustomAssignmentImpl",
    preSelectionClass: null;
    configurationClass: string; // ""
    name: string;
    description: string;
    attributionMecanismDescription: string;
}
