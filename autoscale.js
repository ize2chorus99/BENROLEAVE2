function autoScaleApp(){

    const designWidth = 1600;   // your original design width
    const screenWidth = window.innerWidth;

    let scale = screenWidth / designWidth;

    // Prevent over scaling
    if(scale > 1){
        scale = 1;
    }

    document.querySelector(".app-wrapper").style.transform = "scale(" + scale + ")";
    document.querySelector(".app-wrapper").style.transformOrigin = "top left";

    document.body.style.height = (document.querySelector(".app-wrapper").offsetHeight * scale) + "px";
}

window.addEventListener("load", autoScaleApp);
window.addEventListener("resize", autoScaleApp);