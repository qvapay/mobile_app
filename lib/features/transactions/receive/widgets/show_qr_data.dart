import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile_app/core/widgets/widgets.dart';
import 'package:mobile_app/features/transactions/transactions.dart';
import 'package:mobile_app/features/user_data/user_data.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:screenshot/screenshot.dart';

class ShowQrData extends StatelessWidget {
  const ShowQrData({
    Key? key,
    required this.screenshotController,
  }) : super(key: key);

  final ScreenshotController screenshotController;

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return Screenshot<void>(
      controller: screenshotController,
      child: Container(
        height: size.height * .65,
        margin: const EdgeInsets.only(top: 50, left: 20, right: 20, bottom: 30),
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
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
                        (cubit) => cubit.state.transaction,
                      );
                      return Column(
                        children: [
                          SizedBox(height: size.height * .075),
                          Text(
                            transaction.name,
                            style: TextStyle(
                              fontSize: 18,
                              fontFamily: 'Roboto',
                              fontWeight: FontWeight.bold,
                              color:
                                  Theme.of(context).textTheme.headline1!.color,
                            ),
                          ),
                          const SizedBox(
                            height: 6,
                          ),
                          Text(
                            transaction.email ?? '',
                            style: TextStyle(
                              fontSize: 16,
                              fontFamily: 'Roboto',
                              fontWeight: FontWeight.bold,
                              color: Theme.of(context).primaryColor,
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
                    margin: const EdgeInsets.only(top: 20, bottom: 20),
                    child: Builder(
                      builder: (context) {
                        final transaction = context
                            .select<ReceivePaymentCubit, UserTransaction>(
                                (cubit) => cubit.state.transaction);
                        return QrImage(
                          backgroundColor: Colors.white,
                          data: transaction.encode(),
                          size: size.width * 0.75,
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
                                      icon: Icon(
                                        Icons.close,
                                        color: Theme.of(context)
                                            .textTheme
                                            .headline1!
                                            .color,
                                      ),
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
