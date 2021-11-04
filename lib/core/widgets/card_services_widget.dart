import 'package:flutter/material.dart';
import 'package:mobile_app/core/constants/widgets_constants.dart';

class CardServicesWidget extends StatelessWidget {
  const CardServicesWidget(
      {Key? key,
      required this.title,
      required this.subTitle,
      required this.price,
      required this.balance,
      required this.ico,
      required this.styleGradient})
      : super(key: key);
  final String title;
  final String subTitle;
  final int price;
  final int balance;
  final String ico;
  final LinearGradient styleGradient;

  @override
  Widget build(BuildContext context) {
    return subTitle != ''
        ? Padding(
            padding: const EdgeInsets.all(8),
            child: Container(
              width: 328,
              height: 180,
              decoration: BoxDecoration(
                boxShadow: [
                  BoxShadow(
                    color: Colors.grey.withOpacity(0.5),
                    spreadRadius: 1,
                    blurRadius: 5,
                    offset: const Offset(
                      1,
                      3,
                    ), // changes position of shadow
                  ),
                  BoxShadow(
                    color: Colors.grey.withOpacity(0.5),
                    spreadRadius: 1,
                    blurRadius: 5,
                    offset: const Offset(
                      2,
                      3,
                    ), // changes position of shadow
                  ),
                ],
                gradient: styleGradient,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    //Expanded(child: Column()),
                    Expanded(
                      child: Column(
                        children: [
                          Row(
                            children: [
                              Expanded(
                                flex: 6,
                                child: Row(children: [
                                  Image.asset(
                                    ico,
                                    width: 35,
                                    height: 35,
                                  ),
                                ]),
                              ),
                              const Spacer(),
                              const Expanded(
                                child: Icon(
                                  Icons.circle,
                                  size: 10,
                                  color: kGreenDotCard,
                                ),
                              ),
                            ],
                          ),
                          const Spacer(
                            flex: 3,
                          ),
                          const Spacer(),
                          Row(
                            //crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                //flex: 2,
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      '\$ $balance',
                                      style: kSubTitleCardServices,
                                    ),
                                    Text(
                                      title,
                                      style: kTitleCardServices,
                                    )
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const Spacer(
                            flex: 5,
                          ),
                          Row(
                            //mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                flex: 5,
                                child: Text(
                                  subTitle,
                                  style: kSubTitleCardServices,
                                ),
                              ),
                              //const Spacer(),
                              const Expanded(
                                  child: Text(
                                'PRECIO',
                                style: kSubTitleCardServices,
                              )),
                            ],
                          ),
                          const Spacer(),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              const Expanded(flex: 10, child: Text('')),
                              Expanded(
                                child: Text(
                                  '\$$price',
                                  style: kSubTitleCardServices,
                                ),
                              ),
                            ],
                          ),
                          const Spacer(),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          )
        : Container(
            padding: const EdgeInsets.all(15),
            decoration: BoxDecoration(
              gradient: styleGradient,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                    backgroundColor: Colors.transparent,
                    child: ClipRRect(
                      child: Image.asset(ico),
                    )),
                Text(
                  title,
                  style: kTitleSmartCardServices,
                ),
                const SizedBox(width: 5),
                const Icon(
                  Icons.circle,
                  size: 8,
                  color: kGreenDotCard,
                ),
              ],
            ),
          );
  }
}
