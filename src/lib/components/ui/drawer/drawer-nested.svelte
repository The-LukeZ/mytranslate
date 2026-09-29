<script lang="ts">
  import { Drawer as DrawerPrimitive } from "vaul-svelte";

  let {
    shouldScaleBackground = true,
    // The viewport meta uses `interactive-widget=resizes-content`, so the on-screen keyboard already shrinks the
    // layout viewport. Vaul's own repositioning would offset the drawer a second time (by the keyboard plus the
    // browser's bottom toolbar), pushing its top off-screen.
    repositionInputs = false,
    open = $bindable(false),
    activeSnapPoint = $bindable(null),
    ...restProps
  }: DrawerPrimitive.RootProps = $props();
</script>

<DrawerPrimitive.NestedRoot {shouldScaleBackground} {repositionInputs} bind:open bind:activeSnapPoint {...restProps} />
