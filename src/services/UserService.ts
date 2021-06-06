import axios from "axios";
import { AxiosResponse } from "axios";
import { ServerDTO } from "../models/ServerDTO";
import { Agent } from 'https'

export class UserService {

    /**
     * Obter informações do usuário
     */
    public static async getUser(server: ServerDTO): Promise<AxiosResponse<any>> {
        const uri: string = (server.ssl ? "https://" : "http://")
            + server.host
            + ":" + server.port
            + "/portal/api/rest/wcmservice/rest/user/findUserByLogin"
            + "?username=" + server.username
            + "&password=" + server.password
            + "&login=" + server.username;

        const agent = new Agent({
            rejectUnauthorized: false
        });

        return await axios.get(uri, {
            httpsAgent: agent
        });
    }
}
