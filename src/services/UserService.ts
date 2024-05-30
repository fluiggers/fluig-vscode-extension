import { ServerDTO } from "../models/ServerDTO";
import { UtilsService } from "./UtilsService";

export class UserService {

    /**
     * Obter informações do usuário
     */
    public static getUser(server: ServerDTO): Promise<any> {
        const url = UtilsService.getRestUrl(
            server,
            "/portal/api/rest/wcmservice/rest/user/",
            "findUserByLogin",
            { "login": server.username }
        );

        return fetch(url).then(r => r.json());
    }
}
