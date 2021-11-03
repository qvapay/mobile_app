import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';

class QrPay extends StatelessWidget {
  const QrPay({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kbgPage,
      appBar: AppBar(
        title: const Text('Recibir Pago', style: kStyleTitleReceived),
        centerTitle: true,
        backgroundColor: kbgPage,
        elevation: 0,
        leading: const Icon(
          Icons.arrow_back_ios,
          color: kActiveText,
        ),
        actions: [
          TextButton(
              onPressed: () {},
              child: const Text(
                'Compartir',
                style: kTitleListCreditPay,
              ))
        ],
      ),
      body: SingleChildScrollView(
        child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: const [
              _DataQR(
                  name: 'Cristofer Diaz',
                  email: 'cdiaz@gmail.com',
                  qr: 'assets/images/qr.png',
                  avatar: 'assets/avatars/keanu.png'),
              _BtnSaveQR(),
            ]),
      ),
    );
  }
}

class _DataQR extends StatelessWidget {
  const _DataQR({
    Key? key,
    required this.name,
    required this.email,
    required this.avatar,
    required this.qr,
  }) : super(key: key);

  final String name;
  final String email;
  final String avatar;
  final String qr;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final contentH = size.height - AppBar().preferredSize.height;
    return Container(
      height: contentH >= 500 ? contentH * 0.70 : contentH * 0.65,
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
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Flexible(
                flex: 2,
                child: Column(
                  children: [
                    SizedBox(
                      height: contentH >= 500 ? 50 : 45,
                    ),
                    Text(
                      name,
                      style: kStyleNameReceived,
                    ),
                    const SizedBox(
                      height: 5,
                    ),
                    Text(
                      email,
                      style: kInputDecorationSuffix,
                    ),
                  ],
                ),
              ),
              Expanded(
                flex: 4,
                child: Container(
                  margin:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
                  child: Image.asset(
                    qr,
                    fit: BoxFit.fill,
                  ),
                ),
              ),
              Expanded(
                flex: 1,
                child: Container(
                  margin: EdgeInsets.only(top: 15),
                  //padding: EdgeInsets.only(bottom: 20, top: 30),
                  child: const Text(
                    '+ Especificar Valor',
                    style: kInputDecorationSuffix,
                  ),
                ),
              ),
            ],
          ),
          Positioned.fill(
            top: -40,
            child: Align(
              alignment: Alignment.topCenter,
              child: CircleAvatar(
                radius: 40,
                backgroundColor: Colors.white,
                child: CircleAvatar(
                  backgroundImage: AssetImage(avatar),
                  radius: 38,
                ),
              ),
            ),
          )
        ],
      ),
    );
  }
}

class _BtnSaveQR extends StatelessWidget {
  const _BtnSaveQR({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final contentH = size.height - AppBar().preferredSize.height;
    return Container(
      height: contentH * 0.1,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: ElevatedButton(
          style: ElevatedButton.styleFrom(
              primary: kActiveText,
              // background
              onPrimary: Colors.white,
              //
              elevation: 1,
              minimumSize: const Size(double.maxFinite, 50),
              maximumSize: const Size(double.maxFinite, 50),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20))),
          onPressed: () {},
          child: const Text('Guardar Imagen de QR')),
    );
  }
}
