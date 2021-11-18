import 'dart:io';

import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/constants.dart';
import 'package:mobile_app/features/transactions/widgets/widgets.dart';
import 'package:qr_code_scanner/qr_code_scanner.dart';

class QrScanPage extends StatelessWidget {
  const QrScanPage({Key? key}) : super(key: key);

  /// Returns a [MaterialPageRoute] to navigate to `this` widget.
  static Route go() {
    return MaterialPageRoute<void>(builder: (_) => const QrScanPage());
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: QrScanView(),
    );
  }
}

class QrScanView extends StatefulWidget {
  const QrScanView({
    Key? key,
  }) : super(key: key);

  @override
  State<QrScanView> createState() => _QrScanViewState();
}

class _QrScanViewState extends State<QrScanView> {
  final qrKey = GlobalKey(debugLabel: 'QR');

  QRViewController? controller;
  Barcode? barcode;

  @override
  void dispose() {
    controller?.dispose();
    super.dispose();
  }

  @override
  Future<void> reassemble() async {
    super.reassemble();

    if (Platform.isAndroid) {
      await controller!.pauseCamera();
    }
    await controller!.resumeCamera();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final qButtomWidth = size.width * 0.42;
    const qButtomHeight = kToolbarHeight * 1.25;
    return SafeArea(
      child: Stack(
        alignment: Alignment.center,
        children: [
          QRView(
            key: qrKey,
            onQRViewCreated: onQRViewCreated,
            overlay: QrScannerOverlayShape(
              borderWidth: 15,
              borderLength: 20,
              borderColor: Colors.white,
            ),
          ),
          Positioned(
            top: 0,
            left: 0,
            height: kToolbarHeight,
            width: size.width,
            child: AppBar(
              title: const Text('Escanear QR',
                  style: TextStyle(
                    fontSize: 20,
                    color: Colors.white,
                    fontFamily: 'Roboto',
                    fontWeight: FontWeight.w900,
                  )),
              centerTitle: true,
              backgroundColor: Colors.transparent,
              elevation: 0,
              leading: IconButton(
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(
                  Icons.arrow_back_ios,
                  color: Colors.white,
                ),
              ),
            ),
          ),
          Positioned(
              top: kToolbarHeight * 1.5,
              child: Container(
                width: size.width * 0.85,
                decoration: BoxDecoration(
                  color: Colors.white38,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Padding(
                  padding: EdgeInsets.all(16),
                  child: Center(
                    child: Text('Coloque el QR dentro del área',
                        style: TextStyle(
                          fontSize: 16,
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                        )),
                  ),
                ),
              )),
          Positioned(
            bottom: 0,
            width: size.width,
            child: SizedBox(
                height: size.height * 0.15,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        QButtom(
                          width: qButtomWidth,
                          height: qButtomHeight,
                          styleGradient: kLinearGradientBlue,
                          icon: const Icon(
                            Icons.switch_camera_rounded,
                            color: Colors.white,
                          ),
                          text: 'Camara',
                          onPressed: () async {
                            await controller?.flipCamera();
                            setState(() {});
                          },
                        ),
                        QButtom(
                          width: qButtomWidth,
                          height: qButtomHeight,
                          styleGradient: kLinearGradientBlue,
                          icon: FutureBuilder<bool?>(
                              future: controller?.getFlashStatus(),
                              builder: (context, snapshot) {
                                if (snapshot.data != null) {
                                  return snapshot.data!
                                      ? const Icon(
                                          Icons.flashlight_on_rounded,
                                          color: Colors.white,
                                        )
                                      : const Icon(
                                          Icons.flashlight_off_rounded,
                                          color: Colors.white,
                                        );
                                }
                                return const Icon(
                                  Icons.flashlight_off_rounded,
                                  color: Colors.white,
                                );
                              }),
                          text: 'Linterna',
                          onPressed: () async {
                            await controller?.toggleFlash();
                            setState(() {});
                          },
                        ),
                      ],
                    ),
                  ],
                )),
          )
        ],
      ),
    );
  }

  void onQRViewCreated(QRViewController controller) {
    setState(() => this.controller = controller);

    controller.scannedDataStream
        .listen((barcode) => setState(() => this.barcode = barcode));
  }
}
