import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';

class PagoPage extends StatelessWidget {
  const PagoPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: kbgPage,
      appBar: AppBar(
        title: const Text('Enviar Transacción', style: kStyleTitleReceived),
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
                'Cancelar',
                style: kTitleCancelAdminSaldo,
              ))
        ],
      ),
      body: SingleChildScrollView(
        child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: const [
              _DataUser(
                name: 'Cristofer Diaz',
                email: 'cdiaz@gmail.com',
                avatar: 'assets/avatars/keanu.png',
                date: '02/05/1988',
                operationType: 'Pago P2P',
                transaction: '564848656565',
              ),
              _BtnSaveQR(),
            ]),
      ),
    );
  }
}

class _BtnSaveQR extends StatelessWidget {
  const _BtnSaveQR({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 5),
      height:
          (MediaQuery.of(context).size.height - AppBar().preferredSize.height) *
              0.10,
      child: ElevatedButton(
          style: ElevatedButton.styleFrom(
              primary: kGreenInfo,

              // background
              onPrimary: Colors.white,
              //
              elevation: 1,
              minimumSize: const Size(double.maxFinite, 50),
              maximumSize: const Size(double.maxFinite, 50),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20))),
          onPressed: () {},
          child: const Text('Realizar Pago')),
    );
  }
}

class _DataUser extends StatelessWidget {
  const _DataUser({
    Key? key,
    required this.name,
    required this.email,
    required this.avatar,
    required this.operationType,
    required this.date,
    required this.transaction,
  }) : super(key: key);

  final String name;
  final String email;
  final String avatar;
  final String operationType;
  final String date;
  final String transaction;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final contentH = size.height - AppBar().preferredSize.height;
    print(" ***********     $contentH   ****************");
    return SizedBox(
      height: contentH * 0.85,
      child: Column(
        children: [
          Flexible(
            flex: 3,
            child: Column(
              children: [
                SizedBox(
                  height: contentH >= 500.0 ? 15 : 0,
                ),
                CircleAvatar(
                  radius: contentH >= 500.0 ? 60 : 50,
                  backgroundColor: Colors.white,
                  child: CircleAvatar(
                    backgroundImage: AssetImage(avatar),
                    radius: 58,
                  ),
                ),
                const SizedBox(
                  height: 10,
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
          Flexible(
            flex: 3,
            child: Column(
              children: const [
                Text(
                  'Pago Realizado!',
                  style: kStyleTextPago,
                ),
                SizedBox(
                  height: 20,
                ),
                _RowInfo(
                  title: 'Tipo de Operación:',
                  data: 'Pago P2P',
                ),
                _RowInfo(
                  title: 'Transaccion:',
                  data: '4565236564',
                ),
                _RowInfo(
                  title: 'Fecha:',
                  data: '25/05/2021',
                ),
              ],
            ),
          ),
          Flexible(
            flex: 1,
            child: Column(
              children: [
                const SizedBox(
                  height: 10,
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: RichText(
                    text: TextSpan(
                      text: '(*) ',
                      style: kTitleButtonTransaction,
                      children: <TextSpan>[
                        TextSpan(
                            text:
                                ' En QvaPay las transacciones P2P carecen de impuestos.',
                            style: kStyleTitlePago),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          )
        ],
      ),
    );
  }
}

class _RowInfo extends StatelessWidget {
  const _RowInfo({Key? key, required this.title, required this.data})
      : super(key: key);

  final String title;
  final String data;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            title,
            style: kStyleTitlePago,
          ),
          Text(data, style: kStyleDataPago),
        ],
      ),
    );
  }
}
