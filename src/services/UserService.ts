import axios from "axios";
import { ServerDTO } from "../models/ServerDTO";
import * as https from 'https'

export class UserService {

    /**
     * Obter informações do usuário
     * @param server 
     * @returns 
     */
    public static async getUser(server: ServerDTO) {
        let uri = server.ssl ? "https://" : "http://";
        uri += server.host;
        uri += ":" + server.port;
        uri += "/portal/api/rest/wcmservice/rest/user/findUserByLogin";
        uri += "?username=" + server.username;
        uri += "&password=" + server.password;
        uri += "&login=" + server.username;

        const agent = new https.Agent({
            rejectUnauthorized: false
        })
        return await axios.get(uri, {
            httpsAgent: agent
        });
    }
}