const pluginLess = require("eleventy-plugin-less");

module.exports = function (eleventyConfig) {
    // The legacy SqlMan document sources are retained for reference only.
    // They depend on layouts that are not part of this AJ DB site.
    eleventyConfig.ignores.add("src/docs/**");
    eleventyConfig.ignores.add("src/style/index.less");
    eleventyConfig.addPlugin(pluginLess);
    eleventyConfig.addPassthroughCopy('src/asset');
    // eleventyConfig.addPassthroughCopy("**/*.jpg");
    eleventyConfig.addPassthroughCopy('src/style/reset.css');
    // eleventyConfig.addWatchTarget('src/style');
    // eleventyConfig.addPassthroughCopy("bundle.css");

    	// the default is "copy"
	// eleventyConfig.setServerPassthroughCopyBehavior("passthrough");

    return {
        dir: {
            input: "src",
            output: "dist"
        }
    }
};
