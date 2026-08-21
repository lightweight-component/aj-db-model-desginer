import { createApp } from "vue";
import { createPinia } from "pinia";
import { ColorPicker, Modal, Option, Select, Switch } from "view-ui-plus";
import App from "./App.vue";
import "./styles/base.less";
import "view-ui-plus/dist/styles/viewuiplus.css";

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.component("ColorPicker", ColorPicker);
app.component("Modal", Modal);
app.component("Option", Option);
app.component("Select", Select);
app.component("Switch", Switch);
app.mount("#app");
