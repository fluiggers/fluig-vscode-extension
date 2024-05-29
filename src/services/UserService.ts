import { ServerDTO } from "../models/ServerDTO";
import { UtilsService } from "./UtilsService";

export class UserService {

    /**
     * Obter informações do usuário
     */
    public static getUser(server: ServerDTO): Promise<any> {
        const url = new URL(UtilsService.getHost(server) + "/portal/api/rest/wcmservice/rest/user/findUserByLogin");

        url.searchParams.append("username", server.username);
        url.searchParams.append("password", server.password);
        url.searchParams.append("login", server.username);

        return fetch(url).then(r => r.json());
    }
}
