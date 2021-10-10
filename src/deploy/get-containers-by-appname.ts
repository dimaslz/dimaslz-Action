export const getContainersIDByAppName = async (ssh: any):
	Promise<(name: string) => Promise<string>> => {
		return async (name: string): Promise<string> => {
			return new Promise((resolve) => {
				ssh.execCommand(`docker ps --format="{{.Names}} {{.ID}}" \
	| grep '${name}' \
	| grep -Po '\\s(.*?$)'`).then((result: any) => {
					resolve(result.stdout)
				});
			})
		}
}