import axios from "axios";
import { ServerDTO } from "../models/ServerDTO";

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

        return await axios.get(uri);
    }
}