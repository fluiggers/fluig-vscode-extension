export interface DatasetStructureDTO {
    datasetPK: {
        companyId: number;
        datasetId: string;
    };
    datasetDescription: string;
    datasetImpl: string;
    datasetBuilder: string;
    serverOffline: boolean;
    mobileCache: boolean;
    lastReset: number;
    lastRemoteSync: number;
    type: string;
    mobileOffline: boolean;
    updateIntervalTimestamp: number;
}
