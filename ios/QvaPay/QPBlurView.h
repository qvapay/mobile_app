#import <React/RCTViewComponentView.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Desenfoque del sistema de lo que hay DETRÁS de la vista (UIVisualEffectView
 * con un material fino). Es el fondo de la barra inferior «glass» emulada en
 * iOS < 26, donde no existe el liquid glass nativo. Vista hoja: no monta hijos.
 */
@interface QPBlurView : RCTViewComponentView
@end

NS_ASSUME_NONNULL_END
