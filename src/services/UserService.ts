import { ServerDTO } from "../models/ServerDTO";
import { LoginService } from "./LoginService";
import { UtilsService } from "./UtilsService";

export class UserService {

    /**
     * Obter informações do usuário
     */
    public static async getUser(server: ServerDTO): Promise<any> {
        const cookies = await LoginService.loginAndGetCookies(server);

        // se o jwt.token estiver nos cookies podemos preencher os campos faltantes
        UtilsService.fillServerFromJwtCookies(cookies, server);

        const url = UtilsService.getRestUrl(
            server,
            "/portal/api/rest/wcmservice/rest/user/",
            "findUserByLogin",
            { "login": server.username }
        );

        return fetch(url, {
            headers: { 'Cookie': cookies }
        }).then(r => r.json());
    }
}
