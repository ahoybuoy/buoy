export const SIMPLE_BUTTON_VUE = `
<template>
  <button @click="handleClick">{{ label }}</button>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
}>();

const emit = defineEmits(['click']);
const handleClick = () => emit('click');
</script>

<style scoped>
button { color: #0066cc; }
</style>
`;

export const CARD_WITH_PROPS_VUE = `
<template>
  <div class="card">
    <h2>{{ title }}</h2>
    <p>{{ subtitle }}</p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  title: string;
  subtitle?: string;
}>();
</script>
`;

export const BADGE_WITH_STYLES_VUE = `
<template>
  <span class="badge">{{ text }}</span>
</template>

<script setup lang="ts">
defineProps<{
  text: string;
}>();
</script>

<style scoped>
.badge {
  background-color: #ff0000;
  padding: 8px;
  border-radius: 4px;
}
</style>
`;

export const DEPRECATED_COMPONENT_VUE = `
<template>
  <button>Old Button</button>
</template>

<script setup lang="ts">
/**
 * @deprecated Use NewButton instead
 */
defineProps<{
  label: string;
}>();
</script>
`;

export const OPTIONS_API_COMPONENT_VUE = `
<template>
  <div>{{ message }}</div>
</template>

<script>
export default {
  name: 'MessageDisplay',
  props: {
    message: {
      type: String,
      required: true
    },
    count: Number
  }
}
</script>
`;

export const COMPONENT_WITH_DEPENDENCIES_VUE = `
<template>
  <div>
    <HeaderBar />
    <sidebar-menu />
    <FooterBar />
  </div>
</template>

<script setup lang="ts">
import HeaderBar from './HeaderBar.vue';
import FooterBar from './FooterBar.vue';
</script>
`;

// Element Plus pattern: defineProps with external reference
export const DEFINE_PROPS_VARIABLE_VUE = `
<template>
  <button>{{ label }}</button>
</template>

<script lang="ts" setup>
import { buttonProps } from './button'

defineOptions({
  name: 'ElButton',
})

const props = defineProps(buttonProps)
</script>
`;

// PrimeVue pattern: Options API with extends
export const OPTIONS_API_EXTENDS_VUE = `
<template>
  <button>{{ label }}</button>
</template>

<script>
import BaseButton from './BaseButton.vue';

export default {
  name: 'Button',
  extends: BaseButton,
  inheritAttrs: false,
  computed: {
    disabled() {
      return this.$attrs.disabled || this.loading;
    }
  }
};
</script>
`;

// Complex nested type props with callbacks
export const NESTED_TYPE_PROPS_VUE = `
<template>
  <div>{{ title }}</div>
</template>

<script setup lang="ts">
const props = defineProps<{
  title: string;
  onClick: () => void;
  data: { items: string[]; nested: { value: number } };
  optional?: boolean;
}>();
</script>
`;

// defineProps with withDefaults pattern
export const WITH_DEFAULTS_PROPS_VUE = `
<template>
  <div>{{ message }}</div>
</template>

<script setup lang="ts">
interface Props {
  message: string;
  count?: number;
  items?: string[];
}

const props = withDefaults(defineProps<Props>(), {
  count: 0,
  items: () => []
});
</script>
`;

// Script setup with destructured defineProps (Vue 3.5+ pattern)
export const DESTRUCTURED_DEFINE_PROPS_VUE = `
<template>
  <div>{{ name }}</div>
</template>

<script setup lang="ts">
const { name, age = 0 } = defineProps<{
  name: string;
  age?: number;
}>();
</script>
`;

// Options API with array props syntax
export const ARRAY_PROPS_OPTIONS_API_VUE = `
<template>
  <div>{{ title }}</div>
</template>

<script>
export default {
  name: 'SimpleCard',
  props: ['title', 'subtitle', 'description']
}
</script>
`;

// Options API with PropType imports (like PrimeVue)
export const PROP_TYPE_IMPORT_VUE = `
<template>
  <div>{{ label }}</div>
</template>

<script lang="ts">
import { PropType, defineComponent } from 'vue';

interface ButtonConfig {
  type?: string;
  plain?: boolean;
}

export default defineComponent({
  name: 'ConfigButton',
  props: {
    label: {
      type: String as PropType<string>,
      default: null
    },
    config: {
      type: Object as PropType<ButtonConfig>,
      default: () => ({})
    },
    severity: {
      type: String,
      default: null
    }
  }
});
</script>
`;
