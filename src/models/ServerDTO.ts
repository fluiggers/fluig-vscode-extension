export interface ServerDTO {
    id: string;
    name: string;
    host: string;
    ssl: boolean;
    port: number;
    username: string;
    password: string;
    userCode: string;
    confirmExporting: boolean;
    companyId: number;
}
