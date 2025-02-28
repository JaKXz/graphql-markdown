const path = require("path");

const { convertArrayToObject } = require("../utils/scalars/array");
const { hasProperty } = require("../utils/scalars/object");
const { toSlug, startCase } = require("../utils/scalars/string");
const { pathUrl } = require("../utils/scalars/url");
const {
  hasPrettierModule,
  prettifyJavascript,
  prettifyMarkdown,
} = require("../utils/helpers/prettier");
const {
  saveFile,
  ensureDir,
  copyFile,
  readFile,
  fileExists,
} = require("../utils/helpers/fs");

const { ASSETS_LOCATION } = require("../config");
const { schemaSidebar } = require(`${ASSETS_LOCATION}/sidebar.json`);

const SIDEBAR = "sidebar-schema.js";
const HOMEPAGE_ID = "schema";
const CATEGORY_YAML = "_category_.yml";

module.exports = class Renderer {
  constructor(printer, outputDir, baseURL, group, prettify, docOptions) {
    this.group = group;
    this.outputDir = outputDir;
    this.baseURL = baseURL;
    this.printer = printer;
    this.prettify = prettify && hasPrettierModule();
    this.options = docOptions;
  }

  async generateCategoryMetafile(category, dirPath) {
    const filePath = path.join(dirPath, CATEGORY_YAML);

    if (await fileExists(filePath)) {
      return;
    }

    await ensureDir(dirPath);

    const label = startCase(category);
    const link =
      typeof this.options === "undefined" || !this.options.index
        ? "null"
        : `\n  type: generated-index\n  title: '${label} overview'\n`;

    await saveFile(filePath, `label: ${label}\nlink: ${link}\n`);
  }

  async renderRootTypes(rootTypeName, type) {
    if (typeof type === "undefined" || type === null) {
      return undefined;
    }

    if (Array.isArray(type)) {
      type = convertArrayToObject(type);
    }

    return Promise.all(
      Object.keys(type).map(async (name) => {
        let dirPath = this.outputDir;

        if (hasProperty(this.group, name)) {
          dirPath = path.join(dirPath, toSlug(this.group[name]));
          await this.generateCategoryMetafile(this.group[name], dirPath);
        }

        dirPath = path.join(dirPath, toSlug(rootTypeName));
        await this.generateCategoryMetafile(rootTypeName, dirPath);

        return this.renderTypeEntities(dirPath, name, type[name]);
      }),
    );
  }

  async renderTypeEntities(dirPath, name, type) {
    if (typeof type === "undefined" || type === null) {
      return undefined;
    }

    const fileName = toSlug(name);
    const filePath = path.join(path.normalize(dirPath), `${fileName}.mdx`);

    const content = this.printer.printType(fileName, type, this.options);
    await saveFile(
      filePath,
      this.prettify ? prettifyMarkdown(content) : content,
    );

    const pagePath = path.relative(this.outputDir, filePath);
    const page = pagePath.match(
      /(?<category>[A-Za-z0-9-]+)[\\/]+(?<pageId>[A-Za-z0-9-]+).mdx?$/,
    );
    const slug = pathUrl.join(page.groups.category, page.groups.pageId);

    return { category: startCase(page.groups.category), slug: slug };
  }

  async renderSidebar() {
    const sidebar = {
      schemaSidebar: schemaSidebar.map((entry) => {
        switch (entry.type) {
          case "doc":
            entry.id = pathUrl.join(this.baseURL, HOMEPAGE_ID);
            break;
          case "autogenerated":
            entry.dirName = this.baseURL;
            break;
          default: //do nothing
        }
        return entry;
      }),
    };

    const jsonSidebar = `module.exports = ${JSON.stringify(sidebar, null, 2)};`;

    const filePath = path.join(this.outputDir, SIDEBAR);
    await saveFile(
      filePath,
      this.prettify ? prettifyJavascript(jsonSidebar) : jsonSidebar,
    );

    return path.relative("./", filePath);
  }

  async renderHomepage(homepageLocation) {
    const homePage = path.basename(homepageLocation);
    const destLocation = path.join(this.outputDir, homePage);
    const slug = pathUrl.resolve("/", this.baseURL);

    await copyFile(homepageLocation, destLocation);

    const template = await readFile(destLocation);

    const data = template
      .toString()
      .replace(/##baseURL##/gm, slug)
      .replace(/##generated-date-time##/gm, new Date().toLocaleString());
    await saveFile(destLocation, data);
  }
};
