<template>
  <HelloWorld />
</template>

<script>
import HelloWorld from "./components/HelloWorld.vue";

export default {
  name: "App",
  components: {
    HelloWorld,
  },
};
</script>

<style>
@import url("https://fonts.googleapis.com/css2?family=Fira+Sans+Condensed:ital,wght@0,100;1,900&family=Fira+Sans:wght@100;400&display=swap");
.fira-sans-thin {
  font-family: "Fira Sans", sans-serif;
  font-weight: 100;
  font-style: normal;
}

.fira-sans-regular {
  font-family: "Fira Sans", sans-serif;
  font-weight: 400;
  font-style: normal;
}

.fira-sans-condensed-thin {
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 100;
  font-style: normal;
}

.fira-sans-condensed-black-italic {
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 900;
  font-style: italic;
}

#app {
  position: relative;
  font-family: "Fira Sans", sans-serif;
  font-weight: 400;
  font-style: normal;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin: 0 !important;
  padding: 0 !important;
}

html,
body {
  box-sizing: border-box !important;
  -webkit-user-select: none;
  -webkit-app-region: no-drag;
  overflow: hidden;
}

.button {
  font-family: "Fira Sans Condensed", sans-serif;
  font-weight: 900;
  font-style: italic !important;
  border-radius: 6px;
  cursor: pointer !important;
  text-transform: none;
  /* box-shadow: 8px 8px 0 rgba(#61378e, 0.2); */
  box-shadow: 8px 8px 0 rgba(97, 55, 142, 0.66);
  transition: 200ms ease-in;
  transform: translate3d(0, 0, 0);
}

.button.is-success {
  background: linear-gradient(rgba(57, 213, 130, 0.66), #26b569);
  border: 4px solid #1d8b51 !important;
  text-shadow: 1px -1px 1px #22a05d;
  border-width: 0px 0px 3px !important;
}

.button:hover {
  transition: 200ms ease-in;
  box-shadow: 18px 18px 0 rgba(97, 55, 142, 0.66);
}

@keyframes move {
  0% {
    -webkit-transform-origin: bottom left;
    -moz-transform-origin: bottom left;
    -ms-transform-origin: bottom left;
    -o-transform-origin: bottom left;
    transform-origin: bottom left;
    transform: scale(1.3);
    -ms-transform: scale(1.3);
    /* IE 9 */

    -webkit-transform: scale(1.3);
    /* Safari and Chrome */

    -o-transform: scale(1.3);
    /* Opera */

    -moz-transform: scale(1.3);
    /* Firefox */
  }
  50% {
    transform: scale(1.6);
    -ms-transform: scale(1.6);
    /* IE 9 */

    -webkit-transform: scale(1.6);
    /* Safari and Chrome */

    -o-transform: scale(1.6);
    /* Opera */

    -moz-transform: scale(1.6);
    /* Firefox */
  }
  100% {
    transform-origin: bottom left;
    transform: scale(1.3);
    -ms-transform: scale(1.3);
    /* IE 9 */

    -webkit-transform: scale(1.3);
    /* Safari and Chrome */

    -o-transform: scale(1.3);
    /* Opera */

    -moz-transform: scale(1.3);
    /* Firefox */
  }
}
</style>
