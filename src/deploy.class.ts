export class Deploy {
	private static instance: Deploy;
	private static ssh: any;

	private constructor() { }

	static create(ssh?: any): Deploy {
		if (!Deploy.instance && ssh) {
			Deploy.ssh = ssh;
	    Deploy.instance = new Deploy();
	  }

	  return Deploy.instance;
	}

	async getContainersIDByAppName(name: string): Promise<string> {
		return new Promise((resolve) => {
			Deploy.ssh.execCommand(`docker ps --format="{{.Names}} {{.ID}}" \
			| grep '${name}' \
			| grep -Po '\\s(.*?$)'`).then((result: any) => {
				resolve(result.stdout)
			});
		})
	}

	async getImagesIDByAppName(name: string) {
		return new Promise((resolve) => {
			Deploy.ssh.execCommand(`docker ps --format="{{.Names}} {{.ID}}" \
			| grep '${name}' \
			| grep -Po '\\s(.*?$)'`).then((result: any) => {
				resolve(result.stdout)
			});
		})
	};
}