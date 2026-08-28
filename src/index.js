import EbookReader from './EbookReader.vue';

export { EbookReader };
export default EbookReader;

// Optional Vue plugin: app.use(EbookReaderPlugin) registers <EbookReader>.
export const EbookReaderPlugin = {
    install(app, options = {}) {
        app.component(options.name || 'EbookReader', EbookReader);
    },
};
