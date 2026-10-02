#import "QPSecureView.h"

#import <react/renderer/components/QvaPaySpecs/ComponentDescriptors.h>
#import <react/renderer/components/QvaPaySpecs/Props.h>
#import <react/renderer/components/QvaPaySpecs/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface QPSecureView () <RCTQPSecureViewViewProtocol>
@end

@implementation QPSecureView {
  // El campo se retiene: su lienzo solo es "seguro" mientras el campo vive
  UITextField *_secureField;
  UIView *_canvas;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<QPSecureViewComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    static const auto defaultProps = std::make_shared<const QPSecureViewProps>();
    _props = defaultProps;

    _secureField = [UITextField new];
    _secureField.secureTextEntry = YES;
    _canvas = [self secureCanvasOf:_secureField];
    if (_canvas) {
      [_canvas.subviews makeObjectsPerformSelector:@selector(removeFromSuperview)];
      _canvas.userInteractionEnabled = YES;
      _canvas.translatesAutoresizingMaskIntoConstraints = YES;
      _canvas.frame = self.bounds;
      _canvas.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
      [self addSubview:_canvas];
    }
  }
  return self;
}

/**
 * El lienzo es una subvista privada del campo (su clase interna cambia entre
 * versiones de iOS): se busca por nombre y, si no aparece, la primera. Sin
 * lienzo los hijos se montan en la propia vista — visibles en la captura,
 * pero la pantalla sigue funcionando.
 */
- (nullable UIView *)secureCanvasOf:(UITextField *)field
{
  for (UIView *subview in field.subviews) {
    if ([NSStringFromClass([subview class]) containsString:@"CanvasView"]) {
      return subview;
    }
  }
  return field.subviews.firstObject;
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _canvas.frame = self.bounds;
}

- (void)mountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index
{
  if (!_canvas) {
    [super mountChildComponentView:childComponentView index:index];
    return;
  }
  [_canvas insertSubview:childComponentView atIndex:index];
}

- (void)unmountChildComponentView:(UIView<RCTComponentViewProtocol> *)childComponentView index:(NSInteger)index
{
  if (!_canvas) {
    [super unmountChildComponentView:childComponentView index:index];
    return;
  }
  [childComponentView removeFromSuperview];
}

@end
