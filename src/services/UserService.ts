import { ServerDTO } from "../models/ServerDTO";
import { UtilsService } from "./UtilsService";

export class UserService {

    /**
     * Obter informações do usuário
     */
    public static getUser(server: ServerDTO): Promise<any> {
        const uri: string = UtilsService.getHost(server)
            + "/portal/api/rest/wcmservice/rest/user/findUserByLogin"
            + "?username=" + encodeURIComponent(server.username)
            + "&password=" + encodeURIComponent(server.password)
            + "&login=" + encodeURIComponent(server.username);

        return fetch(uri).then(r => r.json());
    }
}
