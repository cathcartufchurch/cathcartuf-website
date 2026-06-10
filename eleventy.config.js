module.exports = function(eleventyConfig) {
    eleventyConfig.addPassthroughCopy("assets");
    eleventyConfig.addPassthroughCopy("admin");
    eleventyConfig.addPassthroughCopy("api");

    // Ignore documentation files
    eleventyConfig.ignores.add("AZURE-LESSONS-LEARNED.md");
    eleventyConfig.ignores.add("README.md");

    return {
        dir: {
            input: ".",
            output: "_site",
            includes: "_includes",
            data: "_data"
        }
    };
};