/**
 * Watch page — YouTube thumbnail façade
 * 
 * Think of this like a cinema lobby card — visitors see a still image
 * of the service, and only when they click does the actual video load.
 * This means the page loads much faster since YouTube resources are
 * only loaded on demand rather than all at once.
 */

document.addEventListener("DOMContentLoaded", function () {

    // Find all thumbnail containers on the page
    const thumbnails = document.querySelectorAll(".watch-thumbnail");

    thumbnails.forEach(function (thumbnail) {

        thumbnail.addEventListener("click", function () {

            // Get the YouTube video ID stored in a data attribute
            const videoId = thumbnail.dataset.videoId;
            if (!videoId) return;

            // Build the iframe — same attributes as a standard YouTube embed
            const iframe = document.createElement("iframe");
            iframe.src = "https://www.youtube.com/embed/" + videoId + "?autoplay=1";
            iframe.title = thumbnail.dataset.title || "Service recording";
            iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
            iframe.allowFullscreen = true;
            iframe.loading = "lazy";

            // Replace the thumbnail with the live iframe
            const container = thumbnail.closest(".watch-embed");
            container.innerHTML = "";
            container.appendChild(iframe);
        });
    });
});
