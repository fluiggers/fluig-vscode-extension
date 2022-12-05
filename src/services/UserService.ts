import axios from "axios";
import { AxiosResponse } from "axios";
import { ServerDTO } from "../models/ServerDTO";
import { Agent } from 'https'
import { UtilsService } from "./UtilsService";

export class UserService {

    /**
     * Obter informações do usuário
     */
    public static async getUser(server: ServerDTO): Promise<AxiosResponse<any>> {
        const uri: string = UtilsService.getHost(server)
            + "/portal/api/rest/wcmservice/rest/user/findUserByLogin"
            + "?username=" + encodeURIComponent(server.username)
            + "&password=" + encodeURIComponent(server.password)
            + "&login=" + encodeURIComponent(server.username);

        const agent = new Agent({
            rejectUnauthorized: false
        });

        return await axios.get(uri, {
            httpsAgent: agent
        });
    }
}
