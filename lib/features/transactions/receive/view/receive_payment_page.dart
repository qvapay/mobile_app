import 'dart:io';
import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_gallery_saver/image_gallery_saver.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';
import 'package:mobile_app/core/extensions/extensions.dart';
import 'package:mobile_app/core/widgets/widgets.dart';
import 'package:mobile_app/features/transactions/receive/cubit/receive_payment_cubit.dart';
import 'package:mobile_app/features/user_data/models/models.dart';
import 'package:path_provider/path_provider.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:screenshot/screenshot.dart';
import 'package:share_plus/share_plus.dart';

class ReceivePaymentPage extends StatelessWidget {
  ReceivePaymentPage({Key? key}) : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go() {
    return MaterialPageRoute<void>(builder: (_) => ReceivePaymentPage());
  }

  final screenshotController = ScreenshotController();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kbgPage,
      appBar: AppBar(
        title: const Text('Recibir Pago',
            style: TextStyle(
              fontSize: 20,
              color: Color(0xFF3186E7),
              fontFamily: 'Roboto',
              fontWeight: FontWeight.w900,
            )),
        centerTitle: true,
        backgroundColor: kbgPage,
        elevation: 0,
        leading: IconButton(
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(
            Icons.arrow_back_ios,
            color: kActiveText,
          ),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: TextButton(
                onPressed: () {
                  final transaction =
                      context.read<ReceivePaymentCubit>().state.transaction;
                  context.read<ReceivePaymentCubit>().capture(true);
                  screenshotController
                      .capture(
                    pixelRatio: MediaQuery.of(context).devicePixelRatio,
                  )
                      .then((image) async {
                    if (image != null) {
                      final directory =
                          await getApplicationDocumentsDirectory();
                      final imagePath =
                          await File('${directory.path}/image.png').create();
                      await imagePath.writeAsBytes(image);

                      await Share.shareFiles(
                        [imagePath.path],
                        text: 'Transaccion',
                        subject: '${transaction.name} ${transaction.amount}',
                      );
                    }
                  }).then((_) =>
                          context.read<ReceivePaymentCubit>().capture(false));
                },
                child: const Text(
                  'Compartir',
                  style: TextStyle(
                    fontSize: 16,
                    color: Color(0xFF1FBF2F),
                    fontFamily: 'Roboto',
                    fontWeight: FontWeight.w700,
                  ),
                )),
          )
        ],
      ),
      body: ReceivePaymentView(screenshotController: screenshotController),
    );
  }
}

class ReceivePaymentView extends StatefulWidget {
  const ReceivePaymentView({
    Key? key,
    required this.screenshotController,
  }) : super(key: key);

  final ScreenshotController screenshotController;

  @override
  State<ReceivePaymentView> createState() => _ReceivePaymentViewState();
}

class _ReceivePaymentViewState extends State<ReceivePaymentView> {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: SingleChildScrollView(
        child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _DataQR(
                screenshotController: widget.screenshotController,
              ),
              ButtonLarge(
                title: 'Guardar Imagen de QR',
                styleGradient: kLinearGradientBlue,
                active: true,
                padding: EdgeInsets.zero,
                onPressed: () {
                  // TODO: Add permission handler
                  final transaction =
                      context.read<ReceivePaymentCubit>().state.transaction;
                  context.read<ReceivePaymentCubit>().capture(true);

                  widget.screenshotController
                      .capture(
                    pixelRatio: MediaQuery.of(context).devicePixelRatio,
                  )
                      .then((image) async {
                    if (image != null) {
                      await ImageGallerySaver.saveImage(
                          Uint8List.fromList(image),
                          quality: 60,
                          name: '${transaction.name} '
                              '- ${transaction.amount} SQP '
                              '- ${transaction.date.toDmY()}');
                    }
                  }).then((_) {
                    context.read<ReceivePaymentCubit>().capture(false);
                    return ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Imagen guardada en Galería !!'),
                      ),
                    );
                  });
                },
              ),
            ]),
      ),
    );
  }
}

class _DataQR extends StatelessWidget {
  const _DataQR({
    Key? key,
    required this.screenshotController,
  }) : super(key: key);

  final ScreenshotController screenshotController;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final contentH = size.height - kToolbarHeight;
    return Screenshot<void>(
      controller: screenshotController,
      child: Container(
        height: contentH >= 500 ? contentH * 0.75 : contentH * 0.65,
        margin: const EdgeInsets.only(top: 50, left: 20, right: 20, bottom: 30),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Stack(
          alignment: AlignmentDirectional.center,
          clipBehavior: Clip.none,
          fit: StackFit.expand,
          children: [
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Flexible(
                  flex: 2,
                  child: Builder(
                    builder: (context) {
                      final transaction =
                          context.select<ReceivePaymentCubit, UserTransaction>(
                              (cubit) => cubit.state.transaction);
                      return Column(
                        children: [
                          SizedBox(
                            height: contentH >= 500 ? 60 : 45,
                          ),
                          Text(
                            transaction.name,
                            style: const TextStyle(
                              fontSize: 18,
                              fontFamily: 'Roboto',
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF464646),
                            ),
                          ),
                          const SizedBox(
                            height: 6,
                          ),
                          Text(
                            transaction.email ?? '',
                            style: const TextStyle(
                              fontSize: 16,
                              fontFamily: 'Roboto',
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF3186E7),
                            ),
                          ),
                        ],
                      );
                    },
                  ),
                ),
                Expanded(
                  flex: 6,
                  child: Container(
                    margin: const EdgeInsets.symmetric(
                        horizontal: 20, vertical: 20),
                    child: Builder(
                      builder: (context) {
                        final transaction = context
                            .select<ReceivePaymentCubit, UserTransaction>(
                                (cubit) => cubit.state.transaction);
                        return QrImage(
                          data: transaction.encode(),
                          size: size.width * 0.7,
                        );
                      },
                    ),
                  ),
                ),
                Flexible(
                    flex: 2,
                    child:
                        BlocBuilder<ReceivePaymentCubit, ReceivePaymentState>(
                      builder: (context, state) {
                        if (state.isCapture) {
                          return Text(
                            '\$ ${state.transaction.amount}',
                            style: const TextStyle(
                                fontSize: 38, color: Colors.blue),
                          );
                        } else if (state.amountIsVisible && !state.isCapture) {
                          return Container(
                            alignment: Alignment.center,
                            width: size.width * 0.55,
                            child: Column(
                              children: [
                                TextField(
                                  autofocus: true,
                                  decoration: InputDecoration(
                                    suffixIcon: IconButton(
                                      icon: const Icon(Icons.close),
                                      onPressed: () => context
                                          .read<ReceivePaymentCubit>()
                                          .changeVisibilityOfAmount(
                                            visibility: false,
                                            capture: false,
                                          ),
                                    ),
                                    prefixText: r'$',
                                    prefixStyle: const TextStyle(
                                        fontSize: 38, color: Colors.blue),
                                    prefixIcon: const SizedBox.shrink(),
                                    border: InputBorder.none,
                                  ),
                                  keyboardType: TextInputType.number,
                                  style: const TextStyle(
                                      fontSize: 38, color: Colors.blue),
                                  onChanged: (value) => context
                                      .read<ReceivePaymentCubit>()
                                      .changeAmount(value),
                                ),
                                if (state.amount.invalid)
                                  const Text(
                                    'Monto invalido',
                                    style: TextStyle(
                                        fontSize: 12, color: Colors.red),
                                  ),
                              ],
                            ),
                          );
                        }
                        return TextButton(
                          onPressed: () => context
                              .read<ReceivePaymentCubit>()
                              .changeVisibilityOfAmount(
                                visibility: true,
                                capture: false,
                              ),
                          child: const Text(
                            '+ Especificar Valor',
                            style: TextStyle(
                              fontSize: 16,
                              fontFamily: 'Roboto',
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF3186E7),
                            ),
                          ),
                        );
                      },
                    )),
              ],
            ),
            Positioned.fill(
              top: -50,
              child: Align(
                  alignment: Alignment.topCenter,
                  child: ProfileImageNetworkWidget(
                    imageUrl: context
                        .read<ReceivePaymentCubit>()
                        .state
                        .transaction
                        .imageUrl,
                    radius: 50,
                    borderImage: Border.all(color: Colors.white, width: 4),
                  )),
            )
          ],
        ),
      ),
    );
  }
}
