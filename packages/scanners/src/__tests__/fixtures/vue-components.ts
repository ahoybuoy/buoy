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

// External props reference with import (Element Plus pattern)
export const EXTERNAL_PROPS_IMPORT_VUE = `
<template>
  <button>{{ label }}</button>
</template>

<script lang="ts" setup>
import { buttonProps } from './button'
import type { ButtonProps } from './button'

defineOptions({
  name: 'ElButton',
})

const props = defineProps(buttonProps)
</script>
`;

// Style props pattern (theme tokens like color, variant, size)
export const STYLE_PROPS_VUE = `
<template>
  <div :class="classes">{{ label }}</div>
</template>

<script setup lang="ts">
const props = defineProps<{
  label: string;
  color?: 'primary' | 'secondary' | 'error' | 'warning';
  variant?: 'filled' | 'outlined' | 'text';
  size?: 'sm' | 'md' | 'lg';
  elevation?: number;
  rounded?: boolean | 'sm' | 'md' | 'lg' | 'full';
}>();
</script>
`;

// Compound component pattern (parent with subcomponents)
export const COMPOUND_COMPONENT_VUE = `
<template>
  <div class="card">
    <slot></slot>
  </div>
</template>

<script setup lang="ts">
import CardHeader from './CardHeader.vue';
import CardBody from './CardBody.vue';
import CardFooter from './CardFooter.vue';

defineOptions({
  name: 'Card',
});

defineProps<{
  elevated?: boolean;
}>();

// Expose subcomponents for compound pattern
defineExpose({
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
});
</script>
`;

// Generic component with type parameter (Vue 3.3+ pattern)
export const GENERIC_COMPONENT_VUE = `
<template>
  <div>{{ item }}</div>
</template>

<script setup lang="ts" generic="T extends { id: string }">
defineProps<{
  item: T;
  items?: T[];
  onSelect?: (item: T) => void;
}>();
</script>
`;

// Emits with validation (comprehensive events)
export const EMITS_VALIDATION_VUE = `
<template>
  <button @click="handleClick">{{ label }}</button>
</template>

<script setup lang="ts">
const props = defineProps<{
  label: string;
}>();

const emit = defineEmits<{
  (e: 'click', payload: MouseEvent): void;
  (e: 'update:modelValue', value: string): void;
  (e: 'focus'): void;
}>();

const handleClick = (e: MouseEvent) => emit('click', e);
</script>
`;

// Element Plus pattern: external props file (the Vue component)
export const ELEMENT_PLUS_COMPONENT_VUE = `
<template>
  <div :class="ns.b()">
    <span>{{ text }}</span>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { rateProps } from './rate'

defineOptions({
  name: 'ElRate',
})

const props = defineProps(rateProps)
</script>
`;

// Element Plus pattern: external props file (the TypeScript props definition)
export const ELEMENT_PLUS_PROPS_TS = `
import { buildProps, definePropType } from '@element-plus/utils'
import type { ExtractPropTypes } from 'vue'

export const rateProps = buildProps({
  modelValue: {
    type: Number,
    default: 0,
  },
  max: {
    type: Number,
    default: 5,
  },
  size: {
    type: String,
    default: '',
  },
  disabled: {
    type: Boolean,
    default: undefined,
  },
  allowHalf: Boolean,
  lowThreshold: {
    type: Number,
    default: 2,
  },
  highThreshold: {
    type: Number,
    default: 4,
  },
  colors: {
    type: definePropType<string[]>([Array, Object]),
    default: () => [],
  },
} as const)

export type RateProps = ExtractPropTypes<typeof rateProps>
`;

// PrimeVue pattern: Options API component that extends a base
export const PRIMEVUE_CHILD_VUE = `
<template>
  <div :class="cx('root')">
    <slot></slot>
  </div>
</template>

<script>
import BaseTabs from './BaseTabs.vue';

export default {
  name: 'Tabs',
  extends: BaseTabs,
  inheritAttrs: false,
  emits: ['update:value'],
  methods: {
    updateValue(newValue) {
      this.$emit('update:value', newValue);
    }
  }
};
</script>
`;

// PrimeVue pattern: Base component with props
export const PRIMEVUE_BASE_VUE = `
<script>
import BaseComponent from '@primevue/core/basecomponent';

export default {
  name: 'BaseTabs',
  extends: BaseComponent,
  props: {
    value: {
      type: [String, Number],
      default: undefined
    },
    lazy: {
      type: Boolean,
      default: false
    },
    scrollable: {
      type: Boolean,
      default: false
    },
    showNavigators: {
      type: Boolean,
      default: true
    },
    tabindex: {
      type: Number,
      default: 0
    }
  }
};
</script>
`;

// Multiple script blocks pattern (Vuetify docs style)
export const MULTIPLE_SCRIPT_BLOCKS_VUE = `
<template>
  <span class="tooltip-btn">
    <v-btn :variant="variant" v-bind="$attrs" icon>
      <v-icon :icon="icon" />
    </v-btn>
  </span>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'

defineProps({
  icon: String,
  path: String,
  variant: {
    type: String as PropType<'text' | 'outlined' | 'flat'>,
    default: 'text',
  },
})
</script>

<script lang="ts">
export default {
  inheritAttrs: false,
}
</script>
`;

// defineProps with runtime object syntax (common pattern)
export const RUNTIME_PROPS_OBJECT_VUE = `
<template>
  <div>{{ title }}</div>
</template>

<script setup lang="ts">
defineProps({
  title: {
    type: String,
    required: true
  },
  count: {
    type: Number,
    default: 0
  },
  items: {
    type: Array,
    default: () => []
  },
  onClick: Function
})
</script>
`;

// withDefaults with complex inline types including nested objects and callbacks
export const WITH_DEFAULTS_COMPLEX_VUE = `
<template>
  <div>{{ data.items.length }}</div>
</template>

<script setup lang="ts">
interface Props {
  data: { items: string[]; meta: { total: number } };
  onChange?: (value: string) => void;
  options?: { label: string; value: number }[];
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  options: () => [],
  loading: false
});
</script>
`;

// defineProps with interface type reference (type-only import pattern)
export const TYPED_INTERFACE_PROPS_VUE = `
<template>
  <div :class="variant">{{ title }}</div>
</template>

<script setup lang="ts">
interface CardProps {
  title: string;
  variant?: 'default' | 'outlined' | 'elevated';
  loading?: boolean;
}

const props = defineProps<CardProps>();
</script>
`;

// Vue 3.4+ defineModel pattern for two-way binding
export const DEFINE_MODEL_VUE = `
<template>
  <input v-model="model" />
</template>

<script setup lang="ts">
const model = defineModel<string>();
const count = defineModel('count', { type: Number, default: 0 });
const search = defineModel<string>('search', { default: '' });
</script>
`;

// defineModel with required option (Vue 3.4+)
export const DEFINE_MODEL_REQUIRED_VUE = `
<template>
  <div>{{ value }}</div>
</template>

<script setup lang="ts">
const value = defineModel<string>({ required: true });
const items = defineModel<string[]>('items', { required: true });
</script>
`;

// Combined defineModel and defineProps
export const DEFINE_MODEL_WITH_PROPS_VUE = `
<template>
  <input v-model="model" :disabled="disabled" />
</template>

<script setup lang="ts">
const model = defineModel<string>();

const props = defineProps<{
  disabled?: boolean;
  placeholder?: string;
}>();
</script>
`;

// Options API with imported props variable (Element Plus defineComponent pattern)
export const OPTIONS_API_IMPORTED_PROPS_VUE = `
<template>
  <div class="tree">
    <slot></slot>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { treeProps } from './tree'

export default defineComponent({
  name: 'ElTree',
  props: treeProps,
  setup(props) {
    return {}
  }
})
</script>
`;

// Options API imported props definition file (separate .ts file)
export const OPTIONS_API_IMPORTED_PROPS_TS = `
import { buildProps } from '@element-plus/utils'

export const treeProps = buildProps({
  data: {
    type: Array,
    default: () => [],
  },
  nodeKey: String,
  showCheckbox: Boolean,
  lazy: Boolean,
  draggable: Boolean,
  accordion: Boolean,
} as const)
`;
