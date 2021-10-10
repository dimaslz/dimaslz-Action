import deploy from "./deploy";

describe("Deploy", () => {
	test("receive parameters", () => {
		const args = {
			server_ip: "00.00.00.00",
			user: "foo",
			ssh_private_key: "**********",
			app_host: "host.tld",
			app_name: "app-name",
			source: "dist",
		};
		const result = deploy(args);

		expect(result).toStrictEqual(result);
	})
})