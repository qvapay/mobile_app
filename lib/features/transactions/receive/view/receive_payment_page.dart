import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_gallery_saver/image_gallery_saver.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';
import 'package:mobile_app/core/extensions/extensions.dart';
import 'package:mobile_app/core/themes/colors.dart';
import 'package:mobile_app/core/widgets/widgets.dart';
import 'package:mobile_app/features/transactions/receive/cubit/receive_payment_cubit.dart';
import 'package:mobile_app/features/transactions/receive/widgets/widgets.dart';
import 'package:mobile_app/features/user_data/user_data.dart';
import 'package:path_provider/path_provider.dart';
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
      backgroundColor: Theme.of(context).backgroundColor,
      appBar: AppBar(
        title: const Text('Recibir Pago',
            style: TextStyle(
              fontSize: 20,
              color: Color(0xFF3186E7),
              fontFamily: 'Roboto',
              fontWeight: FontWeight.w900,
            )),
        centerTitle: true,
        backgroundColor: Theme.of(context).backgroundColor,
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
                    color: AppColors.greenInfo,
                    fontFamily: 'Roboto',
                    fontWeight: FontWeight.w700,
                  ),
                )),
          )
        ],
      ),
      body: BlocProvider(
        create: (context) {
          final user = context.read<UserDataCubit>().state.userData;
          final transaction = UserTransaction(
            uuid: user!.uuid,
            amount: '',
            description: '',
            name: user.nameAndLastName,
            email: user.email,
            date: DateTime.now(),
            imageUrl: user.logo,
            transactionType: TransactionType.p2p,
          );
          return ReceivePaymentCubit(
            transaction: transaction,
          );
        },
        child: ReceivePaymentView(screenshotController: screenshotController),
      ),
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
      child: Stack(children: [
        Positioned.fill(
          child: SingleChildScrollView(
            child: Column(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  ShowQrData(
                    screenshotController: widget.screenshotController,
                  ),
                  Container(
                    height: MediaQuery.of(context).viewInsets.bottom +
                        kToolbarHeight * 1.3,
                  )
                ]),
          ),
        ),
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          child: Container(
            color: Theme.of(context).backgroundColor,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: ButtonLarge(
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
                  }).onError((error, stackTrace) =>
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content:
                                  Text('Ocurrió un error al guardar imagen !!'),
                            ),
                          ));
                },
              ),
            ),
          ),
        ),
      ]),
    );
  }
}
