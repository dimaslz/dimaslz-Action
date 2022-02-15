/* eslint-disable */

const fs = require("fs");
const jsYml = require("js-yaml");

try {
  let readme = fs.readFileSync(`${__dirname}/../README.md`, 'utf8');
	const { inputs, description } = jsYml.load(fs.readFileSync(`${__dirname}/../action.yml`, 'utf8'));
	const inputMatches = readme.match(/<!-- start inputs -->([^+]+)<!-- end inputs -->/);

	if (inputMatches) {
		const [, inputsBlock] = inputMatches;

		const inputsToReadme = Object.entries(inputs).map(([key, value]) => {
			const { required, description } = value;

			return `- \`${key}${required ? ' [required]' : ''}\`: ${description}`;
		}).join("\n");

		readme = readme.replace(inputsBlock, `\n${inputsToReadme}\n`);
		fs.writeFileSync(`${__dirname}/../README.md`, readme);
	}

	const descriptionMatches = readme.match(/<!-- start description -->([^+]+)<!-- end description -->/);
	if (descriptionMatches) {
		const [, descriptionBlock] = descriptionMatches;
		readme = readme.replace(descriptionBlock, `\n${description}\n`);
		fs.writeFileSync(`${__dirname}/../README.md`, readme);
	}
} catch (e) {
  console.log(e);
}