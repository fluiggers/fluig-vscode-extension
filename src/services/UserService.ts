import { ServerDTO } from "../models/ServerDTO";
import { LoginService } from "./LoginService";
import { UtilsService } from "./UtilsService";

export class UserService {

    /**
     * Obter informações do usuário
     */
    public static async getUser(server: ServerDTO): Promise<any> {
        const url = UtilsService.getRestUrl(
            server,
            "/portal/api/rest/wcmservice/rest/user/",
            "findUserByLogin",
            { "login": server.username }
        );

        return fetch(url, {
            headers: { 'Cookie': await LoginService.loginAndGetCookies(server) }
        }).then(r => r.json());
    }
}
